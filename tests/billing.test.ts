import { it, expect } from "vitest";
import { availableCredits } from "@/lib/billing/plans";
import { validatePrice } from "@/lib/billing/stripe";
import type Stripe from "stripe";

it("excludes expired, future and revoked credits from the displayed balance", () => {
  const start = "2026-10-01T00:00:00Z";
  const credits = [
    {
      kind: "single" as const,
      remaining: 2,
      starts_at: start,
      expires_at: null,
      revoked: false,
    },
    {
      kind: "monthly" as const,
      remaining: 15,
      starts_at: start,
      expires_at: "2026-11-01T00:00:00Z",
      revoked: false,
    },
    {
      kind: "monthly" as const,
      remaining: 20,
      starts_at: "2026-09-01T00:00:00Z",
      expires_at: start,
      revoked: false,
    },
    {
      kind: "single" as const,
      remaining: 1,
      starts_at: start,
      expires_at: null,
      revoked: true,
    },
    {
      kind: "monthly" as const,
      remaining: 20,
      starts_at: "2026-11-01T00:00:00Z",
      expires_at: "2026-12-01T00:00:00Z",
      revoked: false,
    },
  ];
  expect(availableCredits(credits, Date.parse("2026-10-04T00:00:00Z"))).toEqual(
    { single: 2, monthly: 15, periodEnd: "2026-11-01T00:00:00Z" },
  );
});
it("rejects prices with the wrong amount, currency or billing interval", () => {
  const price = {
    active: true,
    currency: "usd",
    unit_amount: 799,
    type: "recurring",
    recurring: { interval: "month", interval_count: 1, usage_type: "licensed" },
  } as Stripe.Price;
  expect(() => validatePrice(price, "monthly")).not.toThrow();
  for (const patch of [
    { unit_amount: 7990 },
    { currency: "eur" },
    { active: false },
    { recurring: { interval: "year", interval_count: 1 } },
  ]) {
    expect(() =>
      validatePrice({ ...price, ...patch } as Stripe.Price, "monthly"),
    ).toThrow();
  }
  expect(() =>
    validatePrice(
      {
        active: true,
        currency: "usd",
        unit_amount: 200,
        type: "one_time",
      } as Stripe.Price,
      "single",
    ),
  ).not.toThrow();
});
