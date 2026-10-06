import type { Finding } from "./schema";
import type { DOMSnapshot } from "../browser/session";
export function measuredFindings(
  url: string,
  viewport: { width: number; height: number },
  dom: DOMSnapshot,
  errors: string[],
  requests: Array<{ url: string; error: string }>,
  violations: Array<{
    id: string;
    impact: string | null | undefined;
    help: string;
    nodes: unknown[];
  }>,
): Finding[] {
  const issues: Finding[] = [];
  function add(
    title: string,
    category: Finding["category"],
    severity: Finding["severity"],
    type: Finding["evidence"][number]["type"],
    detail: string,
    fix: string,
  ) {
    issues.push({
      title,
      category,
      severity,
      confidence: 1,
      url,
      viewport,
      description: detail,
      evidence: [{ type, detail }],
      reproductionSteps: [
        `Open ${url}`,
        `Set viewport to ${viewport.width} × ${viewport.height}`,
        title,
      ],
      suggestedFix: fix,
      sourceFiles: [],
    });
  }
  if (!dom.title.trim())
    add(
      "Page has no title",
      "seo",
      "medium",
      "metadata",
      "The document title is empty.",
      "Add a descriptive, unique title.",
    );
  if (!dom.description.trim())
    add(
      "Meta description is missing",
      "seo",
      "low",
      "metadata",
      "No non-empty meta description was found.",
      "Add a concise page-specific description.",
    );
  if (dom.headings.filter((h) => h.level === "H1").length !== 1)
    add(
      "Page should have one descriptive H1",
      "seo",
      "low",
      "metadata",
      `${dom.headings.filter((h) => h.level === "H1").length} H1 elements found.`,
      "Use a main heading that describes the page.",
    );
  if (dom.viewportMeta === false && viewport.width < 800)
    add(
      "Page has no responsive viewport meta tag",
      "responsive",
      "high",
      "metadata",
      'No <meta name="viewport"> was found, so mobile browsers render a zoomed-out desktop layout.',
      'Add <meta name="viewport" content="width=device-width, initial-scale=1"> to the document head.',
    );
  if (dom.lang === "")
    add(
      "Document language is not declared",
      "accessibility",
      "medium",
      "metadata",
      "The <html> element has no lang attribute, so screen readers may use the wrong pronunciation.",
      'Set <html lang="en"> (or the page\'s language).',
    );
  if (dom.overflow > 4)
    add(
      "Content overflows the viewport",
      "responsive",
      "high",
      "dom",
      `Document exceeds viewport by ${dom.overflow}px.`,
      "Inspect fixed widths, min-width and overflowing containers.",
    );
  for (const text of dom.clipped)
    add(
      "Text container clips content: " + (text ?? "").slice(0, 60),
      "responsive",
      "medium",
      "dom",
      `Measured scrollWidth exceeds clientWidth in a clipped container: ${text}`,
      "Check overflow and container width; confirm intentional truncation.",
    );
  for (const error of [...new Set(errors)])
    add(
      "JavaScript error: " + error.slice(0, 90),
      "reliability",
      "high",
      "console",
      error,
      "Trace the runtime stack and fix the failing code path.",
    );
  for (const r of requests.filter((r) => !r.error.includes("blockedbyclient")))
    add(
      "Failed request: " + r.url.slice(-100),
      "reliability",
      "medium",
      "network",
      `${r.url}: ${r.error}`,
      "Check resource URLs, server status, CORS and request handling.",
    );
  for (const v of violations)
    add(
      v.help,
      "accessibility",
      v.impact === "critical" || v.impact === "serious"
        ? "high"
        : v.impact === "moderate"
          ? "medium"
          : "low",
      "axe",
      JSON.stringify({ rule: v.id, nodes: v.nodes }).slice(0, 4000),
      "Follow the axe rule guidance and verify with keyboard and assistive technology.",
    );
  const metric = dom.metrics[0];
  if (metric && metric.ttfb > 800)
    add(
      "Slow initial server response",
      "performance",
      "medium",
      "metric",
      `Measured TTFB: ${Math.round(metric.ttfb)}ms (single browser navigation).`,
      "Profile server processing and cache delivery; repeat measurements across runs.",
    );
  return issues;
}

const securityHeaders: Array<[string, Finding["severity"], string, string]> = [
  [
    "strict-transport-security",
    "medium",
    "Browsers may connect over plain HTTP before redirecting, which allows downgrade and cookie theft on hostile networks.",
    "Send Strict-Transport-Security: max-age=31536000; includeSubDomains once the whole site works over HTTPS.",
  ],
  [
    "content-security-policy",
    "medium",
    "Without a Content Security Policy, any injected script runs with full page privileges.",
    "Add a Content-Security-Policy header. Start with Content-Security-Policy-Report-Only to find violations, then enforce it.",
  ],
  [
    "x-content-type-options",
    "low",
    "Browsers may MIME-sniff responses and execute files as a different content type.",
    "Send X-Content-Type-Options: nosniff on all responses.",
  ],
];

/** Checks the homepage response for missing protections a browser relies on. */
export function headerFindings(
  url: string,
  headers: Record<string, string>,
  cookies: Array<{
    name: string;
    secure: boolean;
    httpOnly: boolean;
    sameSite: string;
  }>,
  insecureRequests: string[],
): Finding[] {
  const issues: Finding[] = [];
  const https = url.startsWith("https:");
  const add = (
    title: string,
    severity: Finding["severity"],
    detail: string,
    fix: string,
    type: Finding["evidence"][number]["type"] = "header",
  ) =>
    issues.push({
      title,
      category: "security",
      severity,
      confidence: 1,
      url,
      viewport: null,
      description: detail,
      evidence: [{ type, detail }],
      reproductionSteps: [`Request ${url}`, "Inspect the response headers"],
      suggestedFix: fix,
      sourceFiles: [],
    });
  for (const [name, severity, detail, fix] of securityHeaders) {
    if (name === "strict-transport-security" && !https) continue;
    if (!headers[name]) add(`Missing ${name} header`, severity, detail, fix);
  }
  const csp = headers["content-security-policy"] ?? "";
  if (!headers["x-frame-options"] && !/frame-ancestors/i.test(csp))
    add(
      "Page can be embedded by other sites (clickjacking)",
      "low",
      "Neither X-Frame-Options nor a CSP frame-ancestors directive is set.",
      "Send Content-Security-Policy: frame-ancestors 'self' (or X-Frame-Options: DENY).",
    );
  if (!https)
    add(
      "Site is served over plain HTTP",
      "high",
      "The audited URL does not use HTTPS, so traffic can be read and modified in transit.",
      "Serve the site over HTTPS and redirect all HTTP requests to it.",
    );
  const poweredBy = headers["x-powered-by"] ?? headers["server"];
  if (poweredBy && /\d/.test(poweredBy))
    add(
      "Server discloses software versions",
      "info",
      `Response header reveals: ${poweredBy.slice(0, 200)}`,
      "Remove X-Powered-By and version numbers from the Server header.",
    );
  const weak = cookies.filter(
    (cookie) =>
      (https && !cookie.secure) ||
      !cookie.httpOnly ||
      cookie.sameSite === "None",
  );
  if (weak.length)
    add(
      "Cookies are missing security attributes",
      "low",
      weak
        .slice(0, 10)
        .map(
          (c) =>
            `${c.name}: ${[https && !c.secure && "no Secure", !c.httpOnly && "no HttpOnly", c.sameSite === "None" && "SameSite=None"].filter(Boolean).join(", ")}`,
        )
        .join("\n"),
      "Set Secure, HttpOnly (for cookies scripts do not need) and SameSite=Lax or Strict on cookies.",
    );
  if (https && insecureRequests.length)
    add(
      "Page loads resources over insecure HTTP (mixed content)",
      "medium",
      [...new Set(insecureRequests)].slice(0, 15).join("\n"),
      "Load every resource over HTTPS (update hard-coded http:// URLs or use protocol-relative asset hosts).",
      "network",
    );
  return issues;
}
