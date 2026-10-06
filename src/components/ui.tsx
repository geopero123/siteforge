import type { CSSProperties, SVGProps } from "react";

// Counts up to `value` on first render; screen readers read the final value.
export function CountUp({ value, from = 0 }: { value: number; from?: number }) {
  return (
    <>
      <span
        className="count"
        aria-hidden
        style={{ "--to": value, "--from": from } as CSSProperties}
      />
      <span className="sr-only">{value}</span>
    </>
  );
}

export function BrandMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 32 32" className="brand-mark" aria-hidden {...props}>
      <defs>
        <linearGradient id="sf-mark" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#b6f7c4" />
          <stop offset="0.55" stopColor="#7eeaa0" />
          <stop offset="1" stopColor="#4fd1c5" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill="url(#sf-mark)" />
      <path
        d="M9 16.5l4.6 4.6L23.5 11"
        fill="none"
        stroke="#052612"
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="23.5" cy="21.5" r="2.2" fill="#052612" />
    </svg>
  );
}

// GitHub's mark, used only to label GitHub sign-in and repositories.
export function GithubMark({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden
    >
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

export function scoreTone(score: number) {
  return score >= 90 ? "tone-good" : score >= 70 ? "tone-fair" : "tone-poor";
}

export function ScoreRing({
  score,
  size = "large",
  label = "out of 100",
}: {
  score: number;
  size?: "large" | "small";
  label?: string;
}) {
  const radius = 44;
  const circumference = 2 * Math.PI * radius;
  const value = Math.max(0, Math.min(100, score));
  return (
    <div
      className={`score-ring ${size === "small" ? "small" : ""} ${scoreTone(value)}`}
      role="img"
      aria-label={`Score ${value} out of 100`}
    >
      <svg viewBox="0 0 100 100">
        <circle
          className="track"
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          strokeWidth="8"
        />
        <circle
          className="value"
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - value / 100)}
          style={{ "--full": `${circumference}px` } as CSSProperties}
        />
      </svg>
      <div className="score-ring-label" aria-hidden>
        <strong>
          <span className="count" style={{ "--to": value } as CSSProperties} />
        </strong>
        <span className="score-ring-caption">{label}</span>
      </div>
    </div>
  );
}

const statusLabels: Record<string, string> = {
  queued: "Queued",
  running: "Running",
  complete: "Complete",
  partial: "Partial",
  failed: "Failed",
  warning: "Warning",
  open: "Open",
  resolved: "Resolved",
  ignored: "Ignored",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`badge dot ${status}`}>
      {statusLabels[status] ?? status}
    </span>
  );
}

const categoryLabels: Record<string, string> = {
  seo: "SEO",
  ux: "UX",
  responsive: "Responsive",
  accessibility: "Accessibility",
  performance: "Performance",
  reliability: "Reliability",
  security: "Security",
  code: "Code quality",
  dependencies: "Dependencies",
};

export function categoryLabel(category: string) {
  return categoryLabels[category] ?? category;
}

const modeLabels: Record<string, string> = {
  quick: "Quick scan",
  full: "Full audit",
  mission: "Mission",
  repository: "Code scan",
};

export function modeLabel(mode: string, withCode = false) {
  const label = modeLabels[mode] ?? mode;
  return withCode && mode !== "repository" ? `${label} + code` : label;
}

export function relativeTime(iso: string, now = Date.now()) {
  const seconds = Math.round((now - Date.parse(iso)) / 1000);
  if (seconds < 45) return "just now";
  const format = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  if (seconds < 3600) return format.format(-Math.round(seconds / 60), "minute");
  if (seconds < 86400)
    return format.format(-Math.round(seconds / 3600), "hour");
  if (seconds < 604800)
    return format.format(-Math.round(seconds / 86400), "day");
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function displayTarget(audit: {
  url: string | null;
  repository: string | null;
}) {
  if (audit.url) {
    try {
      const url = new URL(audit.url);
      return url.host + (url.pathname === "/" ? "" : url.pathname);
    } catch {
      return audit.url;
    }
  }
  return audit.repository?.split("#")[0] ?? "Untitled";
}
