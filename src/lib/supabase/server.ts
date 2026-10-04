import { supabasePublicKey } from "@/lib/supabase/config";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { cache } from "react";
import { redirect } from "next/navigation";
export async function serverDb() {
  const jar = await cookies();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = supabasePublicKey();
  if (!url || !key)
    throw new Error("Configure Supabase URL and public key in .env.local.");
  return createServerClient(url, key, {
    cookies: {
      getAll: () => jar.getAll(),
      setAll: (items) => {
        try {
          items.forEach(({ name, value, options }) =>
            jar.set(name, value, options),
          );
        } catch {
          /* Cookie refresh is handled by proxy for server components. */
        }
      },
    },
  });
}
export async function requireUser() {
  const db = await serverDb();
  const { data, error } = await db.auth.getUser();
  if (error || !data.user) throw new Error("UNAUTHORIZED");
  return { db, user: data.user };
}
export const pageSession = cache(async () => {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !supabasePublicKey())
    return null;
  const db = await serverDb();
  const { data, error } = await db.auth.getUser();
  if (error || !data.user) redirect("/login");
  return { db, user: data.user };
});
