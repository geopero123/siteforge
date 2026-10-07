import { timingSafeEqual } from "node:crypto";
import { Sandbox } from "@vercel/sandbox";
import { NextResponse } from "next/server";
import { adminDb } from "@/lib/supabase/admin";
import { DEFAULT_GEMINI_MODEL, GeminiProvider } from "@/lib/ai/provider";
import { redactSecrets } from "@/lib/security/redact";
import { reportSchema } from "@/lib/audit/schema";
import {
  dispatchQueuedAudit,
  workerConfigurationError,
} from "@/lib/audit/cloud-worker";
export const maxDuration = 300;

// Private recovery hook for audits queued before automatic startup was installed.
export async function POST(request: Request) {
  const secret = process.env.WORKER_DISPATCH_SECRET;
  const supplied = request.headers
    .get("authorization")
    ?.replace(/^Bearer /, "");
  if (
    !secret ||
    !supplied ||
    Buffer.byteLength(secret) !== Buffer.byteLength(supplied) ||
    !timingSafeEqual(Buffer.from(secret), Buffer.from(supplied))
  )
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const body = await request.text();
  let input: { action?: string } = {};
  try {
    if (body) input = JSON.parse(body);
    if (!input || typeof input !== "object") throw new Error("Invalid request");
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  // Verify the production model with the same provider as audits, without
  // creating an audit or exposing the API key to the caller.
  if (input.action === "verify-ai") {
    try {
      const result = await new GeminiProvider().generateStructured(
        'This is a connection test with no audit evidence. Return JSON {"issues":[],"summary":"Connection successful"}.',
        reportSchema,
      );
      if (result.issues.length || !result.summary.trim())
        throw new Error("Gemini connection test did not pass.");
      return NextResponse.json({
        ready: true,
        model: process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL,
      });
    } catch (error) {
      console.error(
        "Gemini connection test failed:",
        redactSecrets(String(error)),
      );
      return NextResponse.json(
        { error: "Gemini connection test failed. Check deployment logs." },
        { status: 502 },
      );
    }
  }
  // Refresh the configured browser template without ever attaching worker secrets.
  if (input.action === "refresh-snapshot") {
    const snapshotId = process.env.AUDIT_WORKER_SNAPSHOT_ID;
    if (!snapshotId)
      return NextResponse.json(
        { error: "Worker snapshot missing." },
        { status: 503 },
      );
    let sandbox: Sandbox | undefined;
    try {
      sandbox = await Sandbox.create({
        source: { type: "snapshot", snapshotId },
        persistent: false,
        timeout: 120_000,
        networkPolicy: "deny-all",
      });
      const snapshot = await sandbox.snapshot({ expiration: 0 });
      return NextResponse.json({ snapshotId: snapshot.snapshotId });
    } catch {
      await sandbox?.stop().catch(() => {});
      return NextResponse.json(
        { error: "Could not refresh worker snapshot." },
        { status: 502 },
      );
    }
  }
  if (input.action)
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  const configurationError = workerConfigurationError();
  if (configurationError)
    return NextResponse.json({ error: configurationError }, { status: 503 });
  const { data, error } = await adminDb()
    .from("audits")
    .select("id")
    .eq("status", "queued")
    .order("created_at")
    .limit(10);
  if (error)
    return NextResponse.json(
      { error: "Unable to read queue." },
      { status: 500 },
    );
  const results = await Promise.allSettled(
    (data ?? []).map((a) => dispatchQueuedAudit(a.id)),
  );
  const failures = results.filter((r) => r.status === "rejected").length;
  return NextResponse.json(
    {
      started: results.filter((r) => r.status === "fulfilled" && r.value)
        .length,
      failures,
    },
    { status: failures ? 502 : 200 },
  );
}
