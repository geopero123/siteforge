import Link from "next/link";
import { ScanLine, Braces, ShieldCheck, ArrowDown } from "lucide-react";
import { Brand } from "@/components/brand";
import { UrlEntry } from "@/components/url-entry";
import { Pricing } from "@/components/pricing";
export default function Landing() {
  return (
    <>
      <header className="topbar">
        <Brand />
        <nav>
          <a href="#how-it-works">How it works</a>
          <a href="#pricing">Pricing</a>
          <Link href="/login">Sign in</Link>
          <Link className="button small" href="/dashboard">
            Open workspace ↗
          </Link>
        </nav>
      </header>
      <main className="landing">
        <section className="hero">
          <div>
            <div className="eyebrow">Website quality. Verified.</div>
            <h1>
              Find what breaks
              <br />
              before your
              <br />
              <span>users do.</span>
            </h1>
            <p>
              SiteForge explores your website in a real browser, finds bugs and
              accessibility issues, and connects every finding to the evidence
              behind it.
            </p>
            <UrlEntry />
            <div className="hero-note">
              Real browser tests · Desktop, tablet & mobile · Your own audit
              history
            </div>
          </div>
          <div className="terminal" aria-label="Audit pipeline architecture">
            <div className="terminal-head">
              <span className="dot" />
              <span className="dot" />
              <span className="dot" />
              <span className="mono" style={{ marginLeft: 10 }}>
                siteforge / audit pipeline
              </span>
            </div>
            <div className="terminal-body">
              <div className="diagram-node active">
                <span>01 &nbsp; Explore your website</span>
                <ScanLine size={17} />
              </div>
              <div className="diagram-node">
                <span>02 &nbsp; Collect browser evidence</span>
                <span className="code">Playwright</span>
              </div>
              <div className="diagram-node">
                <span>03 &nbsp; Measure what fails</span>
                <span className="code">axe + DOM</span>
              </div>
              <div className="diagram-node">
                <span>04 &nbsp; Reason over evidence</span>
                <span className="code">Gemini</span>
              </div>
              <div
                style={{
                  textAlign: "center",
                  padding: 8,
                  color: "var(--muted)",
                }}
              >
                <ArrowDown size={18} style={{ margin: "auto" }} />
              </div>
              <div className="terminal-label">OUTPUT / TRACEABLE FINDINGS</div>
              <div className="diagram-node active" style={{ margin: 0 }}>
                Prioritized issues. Reproduction steps. Fixes.
              </div>
            </div>
          </div>
        </section>
        <section id="how-it-works" className="feature-grid">
          <article>
            <ScanLine />
            <h2>It actually uses your site.</h2>
            <p>
              Browser navigation, console errors, failed requests, responsive
              screenshots, and goal-based interactions.
            </p>
          </article>
          <article>
            <ShieldCheck />
            <h2>Evidence before opinion.</h2>
            <p>
              Deterministic checks measure objective failures. Visual hypotheses
              include confidence and a screenshot for review.
            </p>
          </article>
          <article>
            <Braces />
            <h2>From symptom to source.</h2>
            <p>
              Connect a repository to investigate likely components and review
              suggested patches. You control every change.
            </p>
          </article>
        </section>
        <Pricing />
        <footer className="landing-footer">
          <span>SiteForge / Built for people who ship.</span>
          <span>Observe → Measure → Explain → Improve</span>
        </footer>
      </main>
    </>
  );
}
