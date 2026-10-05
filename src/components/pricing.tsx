import Link from "next/link";
import { plans } from "@/lib/billing/plans";

export function Pricing({ children }: { children?: React.ReactNode }) {
  return (
    <section id="pricing" className="pricing-section">
      <div className="eyebrow">A SMALL PRICE FOR FEWER SURPRISES</div>
      <h2 className="pricing-heading">
        Test once. Or keep shipping with confidence.
      </h2>
      <p>
        Choose a single test or make website QA part of your monthly routine.
      </p>
      <div className="grid-2">
        <article className="panel pricing-card">
          <h3>{plans.single.name}</h3>
          <p>For a launch, a fix, or a second opinion.</p>
          <div className="pricing-price">
            {plans.single.price}
            <span> / test</span>
          </div>
          <ul>
            <li>One test credit, with no expiry</li>
            <li>Quick, Full, or Mission audit</li>
            <li>Desktop, tablet, and mobile evidence</li>
            <li>Saved report and private screenshots</li>
          </ul>
          {!children && (
            <Link className="button" href="/dashboard/billing">
              Buy a test →
            </Link>
          )}
        </article>
        <article className="panel pricing-card featured">
          <span className="badge complete">For regular testing</span>
          <h3>{plans.monthly.name}</h3>
          <p>Keep checking as your website changes.</p>
          <div className="pricing-price">
            {plans.monthly.price}
            <span> / month</span>
          </div>
          <ul>
            <li>20 test credits each billing month</li>
            <li>About $0.40 per test when you use all 20</li>
            <li>Every audit mode and the same full reports</li>
            <li>Cancel renewal anytime in your billing portal</li>
          </ul>
          {!children && (
            <Link className="button primary" href="/dashboard/billing">
              Get 20 tests a month →
            </Link>
          )}
        </article>
      </div>
      {children}
      <p className="pricing-terms">
        Prices in USD. One audit uses one test credit. Monthly credits expire at
        the end of their billing period and don’t roll over. Extra tests are $2
        each. Failed audits return their credit to its original balance; partial
        reports count as a test. Canceling renewal keeps paid credits until
        their expiry.
      </p>
    </section>
  );
}
