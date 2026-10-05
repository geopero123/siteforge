import { pageSession } from "@/lib/supabase/server";
import { billingStatus } from "@/lib/billing/status";
import { BillingActions } from "@/components/billing-actions";
import { Pricing } from "@/components/pricing";
import Link from "next/link";

export default async function Billing({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string }>;
}) {
  const session = await pageSession();
  if (!session) return null;
  const [status, params] = await Promise.all([
    billingStatus(session.db, session.user.id),
    searchParams,
  ]);
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Tests & billing</h1>
          <p>Know what’s left. Choose what’s next.</p>
        </div>
        <Link className="button" href="/dashboard/new">
          New test →
        </Link>
      </div>
      {params.checkout === "success" && (
        <div className="alert" role="status">
          You’re back from checkout. Your balance updates after payment is
          confirmed. If it hasn’t arrived yet, refresh the balance in a few
          seconds.
        </div>
      )}
      {params.checkout === "canceled" && (
        <div className="alert" role="status">
          Checkout was canceled. You can choose a plan whenever you’re ready.
        </div>
      )}
      <div className="grid-3">
        <section className="panel">
          <div className="stat-label">Available tests</div>
          <div className="stat">{status.single + status.monthly}</div>
          <small>
            {status.enabled
              ? "One credit per audit"
              : "Paid access is not enabled yet"}
          </small>
        </section>
        <section className="panel">
          <div className="stat-label">Monthly tests remaining</div>
          <div className="stat">{status.monthly}</div>
          <small>
            {status.periodEnd
              ? `Credits expire ${new Date(status.periodEnd).toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" })} (UTC)`
              : "20 tests per paid billing month"}
          </small>
        </section>
        <section className="panel">
          <div className="stat-label">Purchased tests remaining</div>
          <div className="stat">{status.single}</div>
          <small>No expiry · used after monthly credits</small>
        </section>
      </div>
      <Pricing>
        <BillingActions
          ready={status.checkoutReady}
          hasCustomer={status.hasCustomer}
        />
      </Pricing>
    </>
  );
}
