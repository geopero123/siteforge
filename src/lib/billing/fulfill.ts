import type Stripe from "stripe";
import { adminDb } from "@/lib/supabase/admin";
import { objectId, priceId } from "./stripe";
import { plans } from "./plans";

async function ownerForCustomer(customer: string | undefined) {
  if (!customer) throw new Error("Payment has no customer.");
  const { data, error } = await adminDb()
    .from("billing_customers")
    .select("user_id")
    .eq("stripe_customer_id", customer)
    .maybeSingle();
  if (error) throw new Error("Unable to resolve the payment account.");
  return data?.user_id as string | undefined;
}

export async function fulfillEvent(stripe: Stripe, event: Stripe.Event) {
  const db = adminDb();
  if (
    event.type === "checkout.session.completed" ||
    event.type === "checkout.session.async_payment_succeeded"
  ) {
    // Read current state, rather than depending on event delivery order.
    const session = await stripe.checkout.sessions.retrieve(
      event.data.object.id,
    );
    if (
      session.mode !== "payment" ||
      session.payment_status !== "paid" ||
      session.metadata?.siteforge_plan !== "single"
    )
      return;
    const owner = await ownerForCustomer(objectId(session.customer));
    if (!owner) return; // Unrelated Stripe customer.
    if (
      owner !== session.client_reference_id ||
      owner !== session.metadata.siteforge_user_id
    )
      throw new Error("Payment account mismatch.");
    const lines = await stripe.checkout.sessions.listLineItems(session.id, {
      limit: 2,
    });
    if (
      lines.has_more ||
      lines.data.length !== 1 ||
      lines.data[0].price?.id !== priceId("single") ||
      lines.data[0].quantity !== 1 ||
      session.currency !== "usd" ||
      session.amount_total !== plans.single.amount
    )
      throw new Error("Unexpected single-test payment.");
    const payment = objectId(session.payment_intent);
    if (!payment) throw new Error("Paid checkout has no payment intent.");
    const intent = await stripe.paymentIntents.retrieve(payment, {
      expand: ["latest_charge"],
    });
    const charge = intent.latest_charge;
    const revoked =
      typeof charge === "object" &&
      charge !== null &&
      (charge.refunded || charge.disputed);
    const { error } = await db.from("test_credits").upsert(
      {
        user_id: owner,
        source: `checkout:${session.id}`,
        kind: "single",
        quantity: 1,
        remaining: 1,
        payment_intent_id: payment,
        revoked,
      },
      { onConflict: "source", ignoreDuplicates: true },
    );
    if (error) throw new Error("Unable to grant purchased test credit.");
    return;
  }
  if (event.type === "invoice.paid") {
    const invoice = await stripe.invoices.retrieve(event.data.object.id, {
      expand: ["payments"],
    });
    if (
      invoice.status !== "paid" ||
      !["subscription_create", "subscription_cycle"].includes(
        invoice.billing_reason ?? "",
      )
    )
      return;
    const owner = await ownerForCustomer(objectId(invoice.customer));
    if (!owner) return;
    const lines = await stripe.invoices.listLineItems(invoice.id, { limit: 2 });
    const line = lines.data[0];
    const subscription = objectId(
      invoice.parent?.subscription_details?.subscription,
    );
    if (
      !subscription ||
      lines.has_more ||
      lines.data.length !== 1 ||
      objectId(line?.pricing?.price_details?.price) !== priceId("monthly") ||
      line.quantity !== 1 ||
      line.parent?.subscription_item_details?.proration ||
      invoice.currency !== "usd" ||
      invoice.amount_paid !== plans.monthly.amount
    ) {
      throw new Error(
        "Unexpected monthly invoice. Review Stripe price or subscription changes.",
      );
    }
    const payments = await stripe.invoicePayments.list({
      invoice: invoice.id,
      status: "paid",
      limit: 2,
    });
    const payment = objectId(payments.data[0]?.payment.payment_intent);
    if (payments.has_more || payments.data.length !== 1 || !payment)
      throw new Error("Monthly invoice requires one verified card payment.");
    const intent = await stripe.paymentIntents.retrieve(payment, {
      expand: ["latest_charge"],
    });
    const charge = intent.latest_charge;
    const revoked =
      typeof charge === "object" &&
      charge !== null &&
      (charge.refunded || charge.disputed);
    const { error } = await db.from("test_credits").upsert(
      {
        user_id: owner,
        source: `invoice:${invoice.id}`,
        kind: "monthly",
        quantity: 20,
        remaining: 20,
        starts_at: new Date(line.period.start * 1000).toISOString(),
        expires_at: new Date(line.period.end * 1000).toISOString(),
        subscription_id: subscription,
        payment_intent_id: payment,
        revoked,
      },
      { onConflict: "source", ignoreDuplicates: true },
    );
    if (error) throw new Error("Unable to grant monthly test credits.");
    return;
  }
  if (
    event.type === "charge.refunded" ||
    event.type === "charge.dispute.created"
  ) {
    const payment = objectId(event.data.object.payment_intent);
    if (!payment) return;
    // A refund or dispute revokes all unused credits from that payment.
    const { error } = await db.rpc("revoke_test_payment", {
      payment_id: payment,
    });
    if (error) throw new Error("Unable to revoke refunded payment credits.");
  }
}
