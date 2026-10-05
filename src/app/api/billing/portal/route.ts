import { NextResponse } from "next/server";
import { apiError, assertSameOrigin } from "@/lib/api";
import { requireUser } from "@/lib/supabase/server";
import { appOrigin, stripeClient } from "@/lib/billing/stripe";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const { db, user } = await requireUser();
    // Resolve ownership from the signed-in account; never accept a customer ID from the browser.
    const { data, error } = await db
      .from("billing_customers")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) throw new Error("Unable to load your billing account.");
    if (!data)
      return NextResponse.json(
        { error: "Purchase a test or subscription first." },
        { status: 404 },
      );
    const session = await stripeClient().billingPortal.sessions.create({
      customer: data.stripe_customer_id,
      return_url: `${appOrigin()}/dashboard/billing`,
    });
    return NextResponse.json({ url: session.url });
  } catch (error) {
    return apiError(error);
  }
}
