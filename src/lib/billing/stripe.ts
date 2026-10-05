import Stripe from "stripe";
import { adminDb } from "@/lib/supabase/admin";
import { plans, type Plan } from "./plans";

export function stripeClient() {
  if (!process.env.STRIPE_SECRET_KEY)
    throw new Error("Payments are not configured yet.");
  return new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: "2026-09-30.endive",
    timeout: 15000,
    maxNetworkRetries: 2,
  });
}
export function appOrigin() {
  if (!process.env.NEXT_PUBLIC_APP_URL)
    throw new Error("Payment return URL is not configured.");
  const url = new URL(process.env.NEXT_PUBLIC_APP_URL);
  if (process.env.NODE_ENV === "production" && url.protocol !== "https:")
    throw new Error("Payments require an HTTPS application URL.");
  return url.origin;
}
export function priceId(plan: Plan) {
  const id =
    plan === "single"
      ? process.env.STRIPE_SINGLE_PRICE_ID
      : process.env.STRIPE_MONTHLY_PRICE_ID;
  if (!id) throw new Error("Payment prices are not configured yet.");
  return id;
}
export function validatePrice(price: Stripe.Price, plan: Plan) {
  if (
    !price.active ||
    price.currency !== "usd" ||
    price.unit_amount !== plans[plan].amount ||
    (plan === "single"
      ? price.type !== "one_time"
      : price.type !== "recurring" ||
        price.recurring?.interval !== "month" ||
        price.recurring.interval_count !== 1 ||
        price.recurring.usage_type !== "licensed")
  ) {
    throw new Error(
      "Configured payment price does not match the SiteForge plan.",
    );
  }
}
export function objectId(value: string | { id: string } | null | undefined) {
  return typeof value === "string" ? value : value?.id;
}
export async function customerForUser(
  stripe: Stripe,
  user: { id: string; email?: string },
) {
  const db = adminDb();
  const { data, error } = await db
    .from("billing_customers")
    .select("stripe_customer_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) throw new Error("Unable to load your billing account.");
  if (data) return data.stripe_customer_id as string;
  const customer = await stripe.customers.create(
    { email: user.email, metadata: { siteforge_user_id: user.id } },
    { idempotencyKey: `siteforge-customer-${user.id}` },
  );
  const saved = await db
    .from("billing_customers")
    .upsert(
      { user_id: user.id, stripe_customer_id: customer.id },
      { onConflict: "user_id", ignoreDuplicates: true },
    );
  if (saved.error) throw new Error("Unable to save your billing account.");
  const canonical = await db
    .from("billing_customers")
    .select("stripe_customer_id")
    .eq("user_id", user.id)
    .single();
  if (canonical.error) throw new Error("Unable to load your billing account.");
  return canonical.data.stripe_customer_id as string;
}
