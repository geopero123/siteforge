import type { Finding, score } from "@/lib/audit/schema";
import type { RepositoryReport } from "@/lib/repository/scan";
export interface StoredIssue {
  id: string;
  data: Finding;
  status: "open" | "resolved" | "ignored";
}
export interface Snapshot {
  workerError?: string | null;
  audit: {
    id: string;
    project_id: string;
    url: string | null;
    repository: string | null;
    mode: string;
    mission: string | null;
    status: string;
    error: string | null;
    created_at: string;
    report: null | {
      summary: string;
      coverage: string[];
      warnings: string[];
      score: ReturnType<typeof score>;
      mission?: {
        outcome: string;
        summary: string;
        evidence?: Array<{ step: number; observation: string }>;
      };
      checks: Record<string, string>;
      repository?: RepositoryReport;
    };
  };
  issues: StoredIssue[];
  events: Array<{
    id: number;
    agent: string;
    message: string;
    status: string;
    created_at: string;
  }>;
  screenshots: Array<{
    id: string;
    path: string;
    url: string;
    signedUrl: string;
    created_at: string;
    viewport: { name: string; width: number; height: number };
  }>;
  steps: Array<{
    id: number;
    tool: string;
    args: unknown;
    result: unknown;
    created_at: string;
  }>;
}

// Repository findings point at a file and line; website findings at a page.
export function findingLocation(finding: Finding, auditUrl: string | null) {
  const source = finding.sourceFiles[0];
  if (finding.url.startsWith("https://github.com/"))
    return source
      ? `${source.path}${source.lines ? ":" + source.lines : ""}`
      : "repository";
  try {
    return new URL(finding.url, auditUrl ?? undefined).pathname;
  } catch {
    return finding.url;
  }
}
