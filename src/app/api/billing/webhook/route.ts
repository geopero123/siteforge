import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripeClient } from "@/lib/billing/stripe";
import { fulfillEvent } from "@/lib/billing/fulfill";

export const runtime = "nodejs";
export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !process.env.STRIPE_SECRET_KEY)
    return NextResponse.json(
      { error: "Webhook is not configured." },
      { status: 503 },
    );
  const stripe = stripeClient();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      await request.text(),
      request.headers.get("stripe-signature") ?? "",
      secret,
    );
  } catch {
    return NextResponse.json(
      { error: "Invalid webhook signature." },
      { status: 400 },
    );
  }
  if (event.livemode !== process.env.STRIPE_SECRET_KEY.startsWith("sk_live_"))
    return NextResponse.json(
      { error: "Webhook payment mode mismatch." },
      { status: 400 },
    );
  try {
    await fulfillEvent(stripe, event);
    return NextResponse.json({ received: true });
  } catch {
    // A failed transaction remains retryable. Do not log payment objects or secrets.
    console.error("SiteForge payment fulfillment failed", {
      eventId: event.id,
      type: event.type,
    });
    return NextResponse.json(
      { error: "Payment fulfillment failed; retry required." },
      { status: 500 },
    );
  }
}
