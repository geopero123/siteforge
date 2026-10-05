import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/server";
import { auditInputSchema } from "@/lib/audit/schema";
import { validateTarget } from "@/lib/security/url";
import { apiError, assertSameOrigin } from "@/lib/api";
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const { db, user } = await requireUser();
    const input = auditInputSchema.parse(await request.json());
    await validateTarget(input.url);
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
    const { data, error } = await db
      .from("audits")
      .insert({
        project_id: input.projectId,
        user_id: user.id,
        url: input.url,
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
    if (error) throw new Error(error.message);
    return NextResponse.json(data, { status: 202 });
  } catch (e) {
    return apiError(e);
  }
}
