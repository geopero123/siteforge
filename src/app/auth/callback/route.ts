import { NextResponse } from "next/server";
import { serverDb } from "@/lib/supabase/server";
export async function GET(request: Request) {
  const url = new URL(request.url),
    code = url.searchParams.get("code");
  if (code) {
    const db = await serverDb();
    const { error } = await db.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL("/dashboard", url.origin));
  }
  return NextResponse.redirect(
    new URL(
      "/login?error=Authentication%20failed.%20Request%20a%20new%20login%20link.",
      url.origin,
    ),
  );
}
