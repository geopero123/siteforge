import Link from "next/link";
import { Check } from "lucide-react";
import { plans } from "@/lib/billing/plans";

export function Pricing({ children }: { children?: React.ReactNode }) {
  return (
    <section id="pricing" className="pricing-section">
      <div className="section-head">
        <div className="eyebrow">Pricing</div>
        <h2>Test once. Or keep shipping with confidence.</h2>
        <p>
          Every audit is the full product: website, code, or both. Choose a
          single test or make QA part of your monthly routine.
        </p>
      </div>
      <div className="pricing-grid">
        <article className="panel pricing-card">
          <h3>{plans.single.name}</h3>
          <p>For a launch, a fix, or a second opinion.</p>
          <div className="pricing-price">
            {plans.single.price}
            <span> / test</span>
          </div>
          <ul className="check-list">
            <li>
              <Check size={15} /> One test credit, with no expiry
            </li>
            <li>
              <Check size={15} /> Quick, Full, Mission or Code scan
            </li>
            <li>
              <Check size={15} /> Desktop, tablet and mobile evidence
            </li>
            <li>
              <Check size={15} /> Saved report, screenshots and patches
            </li>
          </ul>
          {!children && (
            <Link className="button" href="/dashboard/billing">
              Buy a test
            </Link>
          )}
        </article>
        <article className="panel pricing-card featured">
          <span className="badge accent">Best value</span>
          <h3>{plans.monthly.name}</h3>
          <p>Keep checking as your website and code change.</p>
          <div className="pricing-price">
            {plans.monthly.price}
            <span> / month</span>
          </div>
          <ul className="check-list">
            <li>
              <Check size={15} /> 20 test credits each billing month
            </li>
            <li>
              <Check size={15} /> About $0.40 per test when you use all 20
            </li>
            <li>
              <Check size={15} /> Every audit mode and the same full reports
            </li>
            <li>
              <Check size={15} /> Cancel renewal anytime in your billing portal
            </li>
          </ul>
          {!children && (
            <Link className="button primary" href="/dashboard/billing">
              Get 20 tests a month
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
