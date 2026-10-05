import type { SupabaseClient } from "@supabase/supabase-js";
import { availableCredits, type Credit } from "./plans";

export async function billingStatus(db: SupabaseClient, userId: string) {
  const [settings, credits, customer] = await Promise.all([
    db.from("billing_settings").select("enabled").eq("id", true).single(),
    db
      .from("test_credits")
      .select("kind,remaining,starts_at,expires_at,revoked")
      .eq("user_id", userId),
    db
      .from("billing_customers")
      .select("stripe_customer_id")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);
  // The migration is deliberately optional until billing is configured.
  const schemaReady = !settings.error && !credits.error && !customer.error;
  return {
    schemaReady,
    enabled: schemaReady && settings.data?.enabled === true,
    checkoutReady:
      schemaReady &&
      settings.data?.enabled === true &&
      !!process.env.STRIPE_SECRET_KEY &&
      !!process.env.STRIPE_WEBHOOK_SECRET &&
      !!process.env.STRIPE_SINGLE_PRICE_ID &&
      !!process.env.STRIPE_MONTHLY_PRICE_ID &&
      !!process.env.SUPABASE_SERVICE_ROLE_KEY &&
      !!process.env.NEXT_PUBLIC_APP_URL,
    hasCustomer: !!customer.data,
    ...availableCredits((credits.data ?? []) as Credit[]),
  };
}
