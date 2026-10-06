import { NextResponse } from "next/server";
import { after } from "next/server";
import {
  dispatchQueuedAudit,
  workerConfigurationError,
} from "@/lib/audit/cloud-worker";
import { requireUser } from "@/lib/supabase/server";
import { auditInputSchema } from "@/lib/audit/schema";
import { validateTarget } from "@/lib/security/url";
import { apiError, assertSameOrigin, RequestError } from "@/lib/api";
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const { db, user } = await requireUser();
    const input = auditInputSchema.parse(await request.json());
    const url = input.mode === "repository" ? undefined : input.url;
    if (url)
      try {
        await validateTarget(url);
      } catch (e) {
        throw new RequestError((e as Error).message);
      }
    const workerError = workerConfigurationError();
    if (workerError)
      return NextResponse.json({ error: workerError }, { status: 503 });
    const { count, error: countError } = await db
      .from("audits")
      .select("id", { head: true, count: "exact" })
      .eq("user_id", user.id)
      .in("status", ["queued", "running"]);
    if (countError)
      throw new Error(
        "Unable to check the audit queue. Verify database permissions and retry.",
      );
    if ((count ?? 0) >= 3)
      return NextResponse.json(
        {
          error:
            "You already have three pending audits. Wait for one to finish.",
        },
        { status: 429 },
      );
    // Website audits also scan the project's repository when one is attached.
    let repository = input.repository;
    if (!repository) {
      const { data: project, error: projectError } = await db
        .from("projects")
        .select("repository")
        .eq("id", input.projectId)
        .maybeSingle();
      if (projectError)
        throw new Error(
          "Unable to load the project. Verify it exists and retry.",
        );
      repository = project?.repository ?? undefined;
    }
    const { data, error } = await db
      .from("audits")
      .insert({
        project_id: input.projectId,
        user_id: user.id,
        url: url ?? null,
        repository: repository ?? null,
        mode: input.mode,
        mission: input.mission,
        allow_form_submission: input.allowFormSubmission,
      })
      .select()
      .single();
    if (error?.message.includes("TEST_CREDITS_REQUIRED"))
      return NextResponse.json(
        {
          error:
            "You have no tests left. Buy a $2 test or get 20 tests for $7.99/month.",
          code: "TEST_CREDITS_REQUIRED",
        },
        { status: 402 },
      );
    if (error?.message.includes("AUDIT_QUEUE_FULL"))
      return NextResponse.json(
        {
          error:
            "You already have three pending audits. Wait for one to finish.",
        },
        { status: 429 },
      );
    if (error?.message.includes("AUDIT_RATE_LIMITED"))
      return NextResponse.json(
        {
          error:
            "You’ve started 10 audits in the last hour. Try again a little later.",
          code: "AUDIT_RATE_LIMITED",
        },
        { status: 429 },
      );
    if (error) throw new Error(error.message);
    after(async () => {
      await dispatchQueuedAudit(data.id).catch(() => {});
    });
    return NextResponse.json(data, { status: 202 });
  } catch (e) {
    return apiError(e);
  }
}
