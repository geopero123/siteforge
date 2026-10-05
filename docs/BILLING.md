# SiteForge billing

The app has hosted Stripe checkout, a customer portal, verified webhooks, credit balances and database-enforced audit charges. Payments are **not live** until the provider, migration, environment and webhook are configured and tested.

## Plans

- Pay as you go: USD $2 buys one test credit with no expiry.
- Forge Monthly: USD $7.99 per month buys 20 credits for that invoice’s service period. Credits expire at the end of the period; no rollover.
- Quick, Full and Mission each use one credit. Monthly credits are spent before purchased credits.
- A queued audit reserves its credit atomically in PostgreSQL. Queue rejection, invalid project ownership and failed inserts never consume a credit. An audit marked `failed`, including an expired worker lease, returns its credit once to the original grant. If that grant has already expired or been revoked, the returned credit is not usable. Partial reports count as a test.
- Canceling renewal in the portal preserves already paid credits until their expiry. A failed renewal adds no credits. Extra tests are separate $2 purchases; there are no automatic overage charges.
- Refunds and disputes revoke unused credits tied to the payment, including when reversal events arrive before fulfillment. Used credits and saved reports remain recorded. Reversals are permanent; winning a dispute requires an operator review before restoring access.

## Configure in test mode first

1. Confirm Stripe supports the business’s country at https://stripe.com/global. Georgia is not currently listed. If the business cannot use Stripe, select a supported provider and adapt the checkout/webhook layer; the credit database and UI can be reused.
2. Apply `supabase/migrations/20261004162058_test_billing.sql` after the initial migration. It creates billing tables and private charging/refund triggers. **Paid enforcement is off by default**, preserving the existing app until setup is complete.
3. Create two Stripe prices: a one-time USD 200-cent price and a recurring, licensed, monthly USD 799-cent price, quantity one. Use matching test-mode prices and keys. The app verifies the configured price before checkout.
4. Set server environment variables:

   ```env
   STRIPE_SECRET_KEY=sk_test_...
   STRIPE_WEBHOOK_SECRET=whsec_...
   STRIPE_SINGLE_PRICE_ID=price_...
   STRIPE_MONTHLY_PRICE_ID=price_...
   NEXT_PUBLIC_APP_URL=https://your-siteforge-domain.example
   SUPABASE_SERVICE_ROLE_KEY=...
   ```

   The web app now needs the service-role key for verified payment fulfillment and customer mappings. It stays server-side. A browser Stripe publishable key is unnecessary for this hosted redirect flow. Local testing may use an HTTP localhost application URL; production requires HTTPS.
5. Register `https://your-siteforge-domain.example/api/billing/webhook` as a **snapshot event** webhook with API version **2026-09-30.endive**, matching the pinned Stripe SDK. Subscribe to `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `invoice.paid`, `charge.refunded`, and `charge.dispute.created`. Other events are acknowledged without granting credits. The raw request body and signature are verified. Failed fulfillment returns HTTP 500 for Stripe retry; invalid signatures return 400.
6. Enable Stripe’s customer portal. Allow payment method changes, invoice history and **cancellation at period end**. Disable plan/quantity changes, prorations, discounts and trials: these are outside the fixed-price plan contract, and unexpected invoices are rejected for operator review. This version does not calculate sales tax or support coupon/credit-balance invoices; configure the tax approach before public launch rather than enabling additional Stripe pricing features without updating fulfillment.
7. In the test database only, enable billing using an operator/service-role connection:

   ```sql
   update public.billing_settings set enabled=true where id=true;
   ```

   The database is the source of truth for enforcement. This flag also enables checkout once the required configuration is present. Never enable it in production until the same setup has been verified in test mode.
8. Restart the web process. Visit `/dashboard/billing` and complete the checklist below. The worker does not require a Stripe key and failed-job refunds happen through the database trigger.

## Acceptance checklist

- Sign in as an unpaid account. A direct audit insertion and the audit API both reject with `TEST_CREDITS_REQUIRED`; the API returns 402 and links to billing.
- Buy one test with Stripe’s test card. A confirmed webhook adds one credit. Returning to the success URL alone never grants a credit or reports payment as confirmed.
- Replay the paid event; the balance must not increase. Spend the purchased credit, replay again, and confirm it stays spent.
- Subscribe. Initial paid invoice adds 20 credits. A successfully paid renewal adds 20 credits for the new service period. A failed renewal adds nothing. Old credits expire without rollover.
- Launch three audits; the fourth is rejected without spending a credit. Fail one audit and confirm a single refund. Try two requests against one remaining credit and confirm only one starts.
- Cancel renewal in the portal. Paid credits remain until expiry and another subscription attempt directs the user to manage their existing subscription.
- Refund a test payment. Its unused credits are revoked. Verify reversed-payment-first event delivery as well.
- Confirm one user cannot read another’s billing rows, grant credits, change balances, change activation or invoke the reversal RPC. Webhook payload user metadata alone is never sufficient: customer ownership comes from a server-written mapping.

## Verification available locally

`npm test` includes an embedded PostgreSQL run of both migrations. It checks the actual PL/pgSQL credit triggers, direct authenticated inserts, balance isolation, queue limits, payment uniqueness, failure refunds and reversal ordering. PGlite serializes queries in one database instance; its double-submit check does not replace testing concurrent database connections in hosted PostgreSQL. API/fulfillment tests use mocked Stripe responses and signed test payloads, not real card charges.

Run `npm run typecheck`, `npm run lint`, and `npm run build` before deploying. A real test-mode checkout, hosted webhook delivery and portal cancellation remain necessary before live keys are enabled.

## Operational choices

Stripe customer creation is idempotent and the canonical customer is stored by user ID. Checkout creation uses a database reservation across web instances, released after each request; abandoned reservations expire after five minutes. Existing subscriptions block additional subscription checkout and existing open subscription checkouts are reused. Each reserved checkout uses a Stripe idempotency key for safe SDK network retries.

At full usage the monthly plan brings in $7.99 / 20 = about $0.40 per audit before fees and infrastructure costs. Measure browser compute, AI usage, storage and payment fees for Quick, Full and Mission before judging profit. This release preserves the requested equal-credit pricing for all modes; changing mode weights requires corresponding UI and database changes.

References: https://docs.stripe.com/payments/checkout, https://docs.stripe.com/webhooks, https://docs.stripe.com/billing/subscriptions/webhooks.
