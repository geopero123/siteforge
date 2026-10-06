import { CalendarClock, CircleCheck, Coins, Info, Ticket } from "lucide-react";
import { pageSession } from "@/lib/supabase/server";
import { billingStatus } from "@/lib/billing/status";
import { BillingActions } from "@/components/billing-actions";
import { Pricing } from "@/components/pricing";
import { CountUp } from "@/components/ui";
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
          New audit
        </Link>
      </div>
      {params.checkout === "success" && (
        <div className="alert success" role="status">
          <CircleCheck size={16} />
          <div>
            You’re back from checkout. Your balance updates once payment is
            confirmed. If it hasn’t arrived yet, refresh the balance in a few
            seconds.
          </div>
        </div>
      )}
      {params.checkout === "canceled" && (
        <div className="alert info" role="status">
          <Info size={16} />
          <div>
            Checkout was canceled. You can choose a plan whenever you’re ready.
          </div>
        </div>
      )}
      <div className="grid-3">
        <section className="panel stat-card">
          <header>
            <span className="stat-label">Available tests</span>
            <Coins size={16} />
          </header>
          <div className="stat">
            <CountUp value={status.single + status.monthly} />
          </div>
          <small>
            {status.enabled
              ? "One credit per audit"
              : "Paid access is not enabled yet"}
          </small>
        </section>
        <section className="panel stat-card">
          <header>
            <span className="stat-label">Monthly tests remaining</span>
            <CalendarClock size={16} />
          </header>
          <div className="stat">
            <CountUp value={status.monthly} />
            <small className="muted"> / 20</small>
          </div>
          <div className="bar tone-good" style={{ margin: "4px 0 2px" }}>
            <i
              style={{
                width: Math.min(100, (status.monthly / 20) * 100) + "%",
              }}
            />
          </div>
          <small>
            {status.periodEnd
              ? `Expire ${new Date(status.periodEnd).toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" })} (UTC)`
              : "20 tests per paid billing month"}
          </small>
        </section>
        <section className="panel stat-card">
          <header>
            <span className="stat-label">Purchased tests remaining</span>
            <Ticket size={16} />
          </header>
          <div className="stat">
            <CountUp value={status.single} />
          </div>
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
