import type { Finding } from "../audit/schema";
import type { RepositorySnapshot } from "./github";
import { repositoryWebUrl } from "./reference";

export interface SourceIssue {
  title: string;
  category: Finding["category"];
  severity: Finding["severity"];
  confidence: number;
  path: string;
  line?: number;
  description: string;
  snippet?: string;
  suggestedFix: string;
  patch?: string;
  evidenceType?: Finding["evidence"][number]["type"];
}

export function sourceLink(
  snapshot: Pick<RepositorySnapshot, "reference" | "branch" | "commit">,
  path: string,
  line?: number,
) {
  const base = repositoryWebUrl(snapshot.reference);
  if (!path) return base;
  const ref = encodeURIComponent(snapshot.commit ?? snapshot.branch);
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  return `${base}/blob/${ref}/${encoded}${line ? `#L${line}` : ""}`;
}

/** Converts a located repository problem into the shared Finding shape. */
export function sourceFinding(
  snapshot: Pick<RepositorySnapshot, "reference" | "branch" | "commit">,
  issue: SourceIssue,
): Finding {
  const location = issue.path
    ? `${issue.path}${issue.line ? `:${issue.line}` : ""}`
    : "repository root";
  return {
    title: issue.title.slice(0, 180),
    category: issue.category,
    severity: issue.severity,
    confidence: Math.max(0, Math.min(1, issue.confidence)),
    url: sourceLink(snapshot, issue.path, issue.line),
    viewport: null,
    description: issue.description.slice(0, 5000),
    evidence: [
      {
        type: issue.evidenceType ?? "source",
        detail: (issue.snippet
          ? `${location}\n${issue.snippet}`
          : location
        ).slice(0, 4000),
        reference: issue.path || undefined,
      },
    ],
    reproductionSteps: issue.path
      ? [
          `Open ${location} in ${snapshot.reference.owner}/${snapshot.reference.repo}`,
        ]
      : [`Inspect ${snapshot.reference.owner}/${snapshot.reference.repo}`],
    suggestedFix: issue.suggestedFix.slice(0, 5000),
    sourceFiles: issue.path
      ? [
          {
            path: issue.path,
            lines: issue.line ? String(issue.line) : "",
            reason: issue.title.slice(0, 300),
          },
        ]
      : [],
    ...(issue.patch ? { patch: issue.patch.slice(0, 20000) } : {}),
  };
}

export function lineOf(text: string, index: number) {
  let line = 1;
  for (let i = 0; i < index && i < text.length; i++)
    if (text.charCodeAt(i) === 10) line++;
  return line;
}
