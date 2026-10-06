import Link from "next/link";
import {
  Accessibility,
  ArrowRight,
  Check,
  FileDiff,
  KeyRound,
  MonitorSmartphone,
  Package,
  ShieldCheck,
  Sparkles,
  Target,
} from "lucide-react";
import { Brand } from "@/components/brand";
import { UrlEntry } from "@/components/url-entry";
import { Pricing } from "@/components/pricing";
import { ProductPreview } from "@/components/product-preview";

const features = [
  {
    icon: MonitorSmartphone,
    title: "A real browser, three screens",
    text: "Chromium loads your pages at desktop, tablet and mobile sizes and records console errors, failed requests, overflow and clipped text.",
  },
  {
    icon: Accessibility,
    title: "Accessibility you can prove",
    text: "axe-core checks every viewport against WCAG 2.1 AA, with the failing element and a screenshot for each issue.",
  },
  {
    icon: ShieldCheck,
    title: "Security headers and cookies",
    text: "Missing HSTS or CSP, clickjacking exposure, insecure cookies and mixed content are flagged with the exact header to add.",
  },
  {
    icon: KeyRound,
    title: "Secrets and risky code",
    tag: "CODE",
    text: "The whole repository is read for leaked keys, SQL and shell injection, unsafe HTML, disabled TLS and unsafe CI workflows.",
  },
  {
    icon: Package,
    title: "Vulnerable dependencies",
    tag: "CODE",
    text: "Lockfiles from npm, pip, Go, Cargo, Bundler, Composer and more are checked against OSV.dev, with the upgrade command.",
  },
  {
    icon: Target,
    title: "Missions for real user goals",
    text: "Describe a goal like “find the contact form on mobile” and watch the browser try it, step by step, with evidence.",
  },
];

// Kept as strings so the code indentation survives JSX whitespace rules.
const examplePatch: Array<[string, string]> = [
  ["file", "--- a/src/components/PromoBanner.tsx"],
  ["file", "+++ b/src/components/PromoBanner.tsx"],
  ["hunk", "@@ -14,5 +14,5 @@"],
  ["", " export function PromoBanner() {"],
  ["", "   return ("],
  ["del", "-    <div style={{ width: 600 }}>"],
  ["add", '+    <div style={{ maxWidth: 600, width: "100%" }}>'],
  ["", "       Free shipping on orders over $50"],
  ["", "     </div>"],
];

export default function Landing() {
  return (
    <div className="marketing">
      <header className="topbar">
        <div className="topbar-inner">
          <Brand />
          <nav aria-label="Main">
            <a href="#how-it-works">How it works</a>
            <a href="#features">Features</a>
            <a href="#pricing">Pricing</a>
            <Link href="/login">Sign in</Link>
            <Link className="button small primary" href="/dashboard">
              Open workspace
            </Link>
          </nav>
        </div>
      </header>
      <main className="landing">
        <section className="hero">
          <div className="hero-copy">
            <div className="hero-badge">
              <b>New</b> Full GitHub repository scans
            </div>
            <h1>
              Find what breaks{" "}
              <span className="gradient-text">before your users&nbsp;do.</span>
            </h1>
            <p className="hero-lead">
              SiteForge tests your website in a real browser and reads your
              GitHub repository, then hands you every problem with the evidence,
              the exact location and a fix.
            </p>
            <UrlEntry />
            <ul className="hero-checks">
              <li>
                <Check size={14} /> Website, code, or both
              </li>
              <li>
                <Check size={14} /> Read-only repository access
              </li>
              <li>
                <Check size={14} /> From $2 per audit
              </li>
            </ul>
          </div>
          <ProductPreview />
        </section>

        <section className="proof-strip" aria-label="What every audit covers">
          <div>
            <strong>3 viewports</strong>
            <span>Desktop, tablet and mobile captures</span>
          </div>
          <div>
            <strong>9 categories</strong>
            <span>From accessibility to dependencies</span>
          </div>
          <div>
            <strong>11 ecosystems</strong>
            <span>Lockfiles checked against OSV.dev</span>
          </div>
          <div>
            <strong>0 guesses</strong>
            <span>AI claims must quote real evidence</span>
          </div>
        </section>

        <section id="how-it-works" className="section">
          <div className="section-head">
            <div className="eyebrow">How it works</div>
            <h2>Point it at a site or a repo. Get a report you can act on.</h2>
            <p>
              No setup, no scripts to write. SiteForge does the clicking, the
              reading and the cross-checking for you.
            </p>
          </div>
          <div className="steps">
            <article className="step">
              <h3>Give it a URL, a repository, or both</h3>
              <p>
                Paste your website address or a GitHub link. Attach both to
                trace a broken page back to the file that causes it.
              </p>
            </article>
            <article className="step">
              <h3>It tests and reads everything</h3>
              <p>
                A real browser explores your pages while the repository is
                scanned for secrets, risky code and vulnerable packages.
              </p>
            </article>
            <article className="step">
              <h3>Fix with evidence, not opinions</h3>
              <p>
                Each finding links to its page or file and line, with
                screenshots, a suggested fix and a patch you can download.
              </p>
            </article>
          </div>
        </section>

        <section id="features" className="section">
          <div className="section-head">
            <div className="eyebrow">Features</div>
            <h2>
              One audit covers the site your users see and the code behind it.
            </h2>
            <p>
              Deterministic checks find what can be measured. AI fills the gaps,
              and anything it can’t back with evidence is thrown away.
            </p>
          </div>
          <div className="feature-grid">
            {features.map(({ icon: Icon, title, text, tag }) => (
              <article className="feature" key={title}>
                <div className="feature-icon">
                  <Icon size={18} />
                </div>
                <h3>
                  {title}
                  {tag && <span className="feature-tag">{tag}</span>}
                </h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="section">
          <div className="grid-2" style={{ alignItems: "center", gap: 48 }}>
            <div className="section-head" style={{ margin: 0 }}>
              <div className="eyebrow">From symptom to source</div>
              <h2>Patches you can trust, because they’re checked.</h2>
              <p>
                When a repository is attached, website problems are matched to
                the files that cause them. A suggested patch is only kept if
                every line it removes really exists in your code.
              </p>
              <ul className="check-list" style={{ marginTop: 22 }}>
                <li>
                  <Check size={15} /> Links to the exact file and line on GitHub
                </li>
                <li>
                  <Check size={15} /> Unified diffs you can download and apply
                </li>
                <li>
                  <Check size={15} /> Nothing is ever pushed to your repository
                </li>
              </ul>
            </div>
            <div className="panel" style={{ padding: 0, overflow: "hidden" }}>
              <div className="window-bar">
                <FileDiff size={14} color="var(--muted)" />
                <span className="address">src/components/PromoBanner.tsx</span>
              </div>
              <div className="diff" style={{ border: 0, borderRadius: 0 }}>
                <div className="diff-lines">
                  {examplePatch.map(([kind, line], index) => (
                    <div key={index} className={kind || undefined}>
                      {line}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <Pricing />

        <section className="cta-band">
          <div>
            <h2>Ship your next release with fewer surprises.</h2>
            <p>
              Sign in with email or GitHub and run your first audit in minutes.
            </p>
          </div>
          <Link className="button primary large" href="/dashboard/new">
            <Sparkles size={16} /> Start an audit <ArrowRight size={16} />
          </Link>
        </section>

        <footer className="landing-footer">
          <Brand />
          <nav aria-label="Footer">
            <a href="#features">Features</a>
            <a href="#pricing">Pricing</a>
            <Link href="/login">Sign in</Link>
          </nav>
          <span>Observe → Measure → Explain → Improve</span>
        </footer>
      </main>
    </div>
  );
}
