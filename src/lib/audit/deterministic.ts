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
      v.impact === "critical"
        ? "high"
        : v.impact === "serious"
          ? "high"
          : "medium",
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
