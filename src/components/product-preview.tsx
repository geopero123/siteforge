import type { CSSProperties } from "react";
import { GitPullRequestArrow } from "lucide-react";
import { ScoreRing, scoreTone } from "./ui";

const bars: Array<[string, number]> = [
  ["Accessibility", 85],
  ["Security", 62],
  ["Responsive", 78],
  ["Dependencies", 93],
];

const findings: Array<[string, string, string]> = [
  ["critical", "Stripe live secret key committed", "src/config/stripe.ts:3"],
  ["high", "Content overflows the viewport", "/checkout · 390px"],
  ["high", "lodash@4.17.15 has 2 known vulnerabilities", "package-lock.json"],
  ["medium", "Missing content-security-policy header", "shop.example.com"],
];

const previewDiff: Array<[string, string]> = [
  ["hunk", "@@ src/server/orders.ts:42 @@"],
  ["del", "- db.query(`… WHERE id = ${id}`)"],
  ["add", '+ db.query("… WHERE id = $1", [id])'],
];

// Illustration of a report for the marketing and sign-in pages. It plays a
// short scan animation on load (see the Motion section in globals.css).
export function ProductPreview({ withNote = true }: { withNote?: boolean }) {
  return (
    <div className="preview-wrap" aria-hidden>
      <div className="preview-card">
        <div className="window-bar">
          <i />
          <i />
          <i />
          <span className="address">
            siteforge / shop.example.com + acme/storefront
          </span>
        </div>
        <div className="preview-body">
          <div className="preview-score">
            <ScoreRing score={74} size="small" />
            <div className="preview-bars">
              {bars.map(([label, value], index) => (
                <div
                  key={label}
                  className={`score-item ${scoreTone(value)}`}
                  style={{ "--i": index } as CSSProperties}
                >
                  <span>
                    {label}
                    <strong>{value}</strong>
                  </span>
                  <div className="bar">
                    <i style={{ width: value + "%" }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="preview-findings">
            {findings.map(([severity, title, location], index) => (
              <div
                className="preview-finding"
                key={title}
                style={{ "--i": index } as CSSProperties}
              >
                <span className={`badge ${severity}`}>{severity}</span>
                <strong>{title}</strong>
                <small>{location}</small>
              </div>
            ))}
          </div>
          <div className="diff preview-diff">
            <div className="diff-lines">
              {previewDiff.map(([kind, line], index) => (
                <div
                  key={index}
                  className={kind}
                  style={{ "--i": index } as CSSProperties}
                >
                  {line}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      {withNote && (
        <div className="floating-note">
          <GitPullRequestArrow size={16} />
          Patch verified against the real file
        </div>
      )}
    </div>
  );
}
