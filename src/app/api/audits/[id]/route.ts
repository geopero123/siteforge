import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/server";
import { apiError } from "@/lib/api";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { db } = await requireUser();
    const { id } = await params;
    const { data: audit, error } = await db
      .from("audits")
      .select("*")
      .eq("id", id)
      .single();
    if (error || !audit)
      return NextResponse.json({ error: "Audit not found" }, { status: 404 });
    const [issues, events, screenshots, steps] = await Promise.all([
      db.from("issues").select("*").eq("audit_id", id),
      db.from("agent_runs").select("*").eq("audit_id", id).order("id"),
      db.from("screenshots").select("*").eq("audit_id", id),
      db.from("mission_steps").select("*").eq("audit_id", id).order("id"),
    ]);
    for (const r of [issues, events, screenshots, steps])
      if (r.error) throw new Error(r.error.message);
    const shots = await Promise.all(
      (screenshots.data ?? []).map(async (s) => {
        const { data, error } = await db.storage
          .from("screenshots")
          .createSignedUrl(s.path, 3600);
        if (error) throw new Error(error.message);
        const signedUrl =
          s.viewport?.name === "live"
            ? data.signedUrl + "&frame=" + encodeURIComponent(s.created_at)
            : data.signedUrl;
        return { ...s, signedUrl };
      }),
    );
    return NextResponse.json(
      {
        audit,
        issues: issues.data,
        events: events.data,
        screenshots: shots,
        steps: steps.data,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    return apiError(e);
  }
}
