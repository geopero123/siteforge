import { beforeEach, it, expect, vi } from "vitest";
import Stripe from "stripe";
vi.mock("@/lib/supabase/admin", () => ({ adminDb: vi.fn() }));
import { adminDb } from "@/lib/supabase/admin";
import { POST } from "@/app/api/billing/webhook/route";
import { fulfillEvent } from "@/lib/billing/fulfill";

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_siteforge");
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_siteforge");
  vi.stubEnv("STRIPE_SINGLE_PRICE_ID", "price_single");
  vi.stubEnv("STRIPE_MONTHLY_PRICE_ID", "price_monthly");
});
it("rejects forged webhook signatures before database access", async () => {
  const response = await POST(
    new Request("https://siteforge.example/api/billing/webhook", {
      method: "POST",
      headers: { "stripe-signature": "invalid" },
      body: "{}",
    }),
  );
  expect(response.status).toBe(400);
  expect(adminDb).not.toHaveBeenCalled();
});
it("acknowledges a signed irrelevant event without granting credits", async () => {
  const payload = JSON.stringify({
    id: "evt_test",
    object: "event",
    type: "customer.created",
    livemode: false,
    data: { object: { id: "cus_test" } },
  });
  const signature = Stripe.webhooks.generateTestHeaderString({
    payload,
    secret: "whsec_siteforge",
  });
  const response = await POST(
    new Request("https://siteforge.example/api/billing/webhook", {
      method: "POST",
      headers: { "stripe-signature": signature },
      body: payload,
    }),
  );
  expect(response.status).toBe(200);
});
function fixture() {
  const upsert = vi.fn(async () => ({ error: null }));
  const lookup = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn(async () => ({
      data: { user_id: "owner" },
      error: null,
    })),
  };
  lookup.select.mockReturnValue(lookup);
  lookup.eq.mockReturnValue(lookup);
  const rpc = vi.fn(async () => ({ error: null }));
  vi.mocked(adminDb).mockReturnValue({
    from: vi.fn((table) =>
      table === "billing_customers" ? lookup : { upsert },
    ),
    rpc,
  } as never);
  const session = {
    id: "cs_paid",
    mode: "payment",
    payment_status: "paid",
    customer: "cus_owner",
    client_reference_id: "owner",
    metadata: { siteforge_plan: "single", siteforge_user_id: "owner" },
    currency: "usd",
    amount_total: 200,
    payment_intent: "pi_paid",
  };
  const stripe = {
    checkout: {
      sessions: {
        retrieve: vi.fn(async () => session),
        listLineItems: vi.fn(async () => ({
          has_more: false,
          data: [{ price: { id: "price_single" }, quantity: 1 }],
        })),
      },
    },
    paymentIntents: {
      retrieve: vi.fn(async () => ({
        latest_charge: { refunded: false, disputed: false },
      })),
    },
    invoices: { retrieve: vi.fn(), listLineItems: vi.fn() },
    invoicePayments: { list: vi.fn() },
  };
  return { stripe, upsert, session, rpc };
}
const checkoutEvent = {
  type: "checkout.session.completed",
  data: { object: { id: "cs_paid" } },
} as Stripe.Event;
it("grants one test only after payment confirmation using customer ownership", async () => {
  const f = fixture();
  await fulfillEvent(f.stripe as unknown as Stripe, checkoutEvent);
  expect(f.upsert).toHaveBeenCalledWith(
    expect.objectContaining({
      user_id: "owner",
      source: "checkout:cs_paid",
      remaining: 1,
      quantity: 1,
    }),
    { onConflict: "source", ignoreDuplicates: true },
  );
});
it("does not grant credit for an unpaid checkout", async () => {
  const f = fixture();
  f.session.payment_status = "unpaid";
  await fulfillEvent(f.stripe as unknown as Stripe, checkoutEvent);
  expect(f.upsert).not.toHaveBeenCalled();
});
it("rejects mismatched customer ownership and wrong payment amounts", async () => {
  const f = fixture();
  f.session.metadata.siteforge_user_id = "attacker";
  await expect(
    fulfillEvent(f.stripe as unknown as Stripe, checkoutEvent),
  ).rejects.toThrow("mismatch");
  f.session.metadata.siteforge_user_id = "owner";
  f.session.amount_total = 1;
  await expect(
    fulfillEvent(f.stripe as unknown as Stripe, checkoutEvent),
  ).rejects.toThrow("Unexpected");
  expect(f.upsert).not.toHaveBeenCalled();
});
it("grants monthly credits for exactly the paid invoice service period", async () => {
  const f = fixture();
  f.stripe.invoices.retrieve.mockResolvedValue({
    id: "in_paid",
    customer: "cus_owner",
    status: "paid",
    billing_reason: "subscription_cycle",
    currency: "usd",
    amount_paid: 799,
    parent: { subscription_details: { subscription: "sub_owner" } },
  });
  f.stripe.invoices.listLineItems.mockResolvedValue({
    has_more: false,
    data: [
      {
        pricing: { price_details: { price: "price_monthly" } },
        quantity: 1,
        period: { start: 1790812800, end: 1793491200 },
      },
    ],
  });
  f.stripe.invoicePayments.list.mockResolvedValue({
    has_more: false,
    data: [{ payment: { payment_intent: "pi_paid" } }],
  });
  await fulfillEvent(
    f.stripe as unknown as Stripe,
    {
      type: "invoice.paid",
      data: { object: { id: "in_paid" } },
    } as Stripe.Event,
  );
  expect(f.upsert).toHaveBeenCalledWith(
    expect.objectContaining({
      source: "invoice:in_paid",
      quantity: 20,
      remaining: 20,
      starts_at: "2026-10-01T00:00:00.000Z",
      expires_at: "2026-11-01T00:00:00.000Z",
    }),
    { onConflict: "source", ignoreDuplicates: true },
  );
});
it("does not grant new credits for a failed invoice", async () => {
  const f = fixture();
  f.stripe.invoices.retrieve.mockResolvedValue({
    id: "in_unpaid",
    status: "open",
    billing_reason: "subscription_cycle",
  });
  await fulfillEvent(
    f.stripe as unknown as Stripe,
    {
      type: "invoice.paid",
      data: { object: { id: "in_unpaid" } },
    } as Stripe.Event,
  );
  expect(f.upsert).not.toHaveBeenCalled();
});
it("records refund reversals by verified payment intent", async () => {
  const f = fixture();
  await fulfillEvent(
    f.stripe as unknown as Stripe,
    {
      type: "charge.refunded",
      data: { object: { payment_intent: "pi_paid" } },
    } as Stripe.Event,
  );
  expect(f.rpc).toHaveBeenCalledWith("revoke_test_payment", {
    payment_id: "pi_paid",
  });
});
