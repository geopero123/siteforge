import { redirect } from "next/navigation";
import { serverDb } from "@/lib/supabase/server";
export async function GET(request: Request) {
  const url = new URL(request.url),
    code = url.searchParams.get("code");
  if (code) {
    const db = await serverDb();
    const flowId = url.searchParams.get("sb_flow_id") ?? undefined;
    const { data, error } = await db.auth.exchangeCodeForSession(code, { flowId });
    if (!error) {
      const recovery = "redirectType" in data && data.redirectType === "recovery";
      redirect(recovery ? "/login?mode=update-password" : "/dashboard");
    }
  }
  redirect("/login?error=link-expired");
}
