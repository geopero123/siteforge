import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, assertSameOrigin } from "@/lib/api";
import { requireUser } from "@/lib/supabase/server";
import { billingStatus } from "@/lib/billing/status";
import { adminDb } from "@/lib/supabase/admin";
import {
  stripeClient,
  appOrigin,
  priceId,
  validatePrice,
  customerForUser,
} from "@/lib/billing/stripe";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const { db, user } = await requireUser();
    const { plan } = z
      .object({ plan: z.enum(["single", "monthly"]) })
      .parse(await request.json());
    if (!(await billingStatus(db, user.id)).checkoutReady)
      return NextResponse.json(
        { error: "Payments are not available yet. Please try again later." },
        { status: 503 },
      );
    const stripe = stripeClient();
    const price = priceId(plan);
    validatePrice(await stripe.prices.retrieve(price), plan);
    const customer = await customerForUser(stripe, user);
    const billingDb = adminDb();
    const lockToken = crypto.randomUUID();
    const lock = await billingDb.rpc("lock_test_checkout", {
      owner_id: user.id,
      lock_token: lockToken,
    });
    if (lock.error) throw new Error("Unable to reserve checkout.");
    if (!lock.data)
      return NextResponse.json(
        {
          error:
            "Another checkout request is in progress. Please retry shortly.",
        },
        { status: 409 },
      );
    try {
      if (plan === "monthly") {
        const subscriptions = await stripe.subscriptions.list({
          customer,
          status: "all",
          limit: 100,
        });
        if (
          subscriptions.data.some(
            (s) => !["canceled", "incomplete_expired"].includes(s.status),
          )
        ) {
          return NextResponse.json(
            {
              error:
                "You already have a subscription. Use Manage billing to view or update it.",
            },
            { status: 409 },
          );
        }
        const open = await stripe.checkout.sessions.list({
          customer,
          status: "open",
          limit: 100,
        });
        const existing = open.data.find(
          (s) =>
            s.mode === "subscription" &&
            s.metadata?.siteforge_plan === "monthly",
        );
        if (existing?.url) return NextResponse.json({ url: existing.url });
      }
      const origin = appOrigin();
      const session = await stripe.checkout.sessions.create(
        {
          customer,
          client_reference_id: user.id,
          mode: plan === "monthly" ? "subscription" : "payment",
          line_items: [{ price, quantity: 1 }],
          allowed_payment_method_types: ["card"],
          metadata: { siteforge_plan: plan, siteforge_user_id: user.id },
          ...(plan === "monthly"
            ? {
                subscription_data: { metadata: { siteforge_user_id: user.id } },
              }
            : {}),
          success_url: `${origin}/dashboard/billing?checkout=success`,
          cancel_url: `${origin}/dashboard/billing?checkout=canceled`,
        },
        {
          idempotencyKey: `siteforge-checkout-${user.id}-${plan}-${lockToken}`,
        },
      );
      if (!session.url) throw new Error("Unable to open checkout.");
      return NextResponse.json({ url: session.url });
    } finally {
      const released = await billingDb.rpc("unlock_test_checkout", {
        owner_id: user.id,
        lock_token: lockToken,
      });
      if (released.error)
        console.error("SiteForge checkout lock release failed");
    }
  } catch (error) {
    return apiError(error);
  }
}
