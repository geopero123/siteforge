"use client";
import { supabasePublicKey } from "@/lib/supabase/config";
import { createBrowserClient } from "@supabase/ssr";
export function browserDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = supabasePublicKey();
  if (!url || !key)
    throw new Error(
      "Supabase is not configured. Add the public URL and key to .env.local.",
    );
  return createBrowserClient(url, key);
}
