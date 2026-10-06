import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { adminDb } from "@/lib/supabase/admin";
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
