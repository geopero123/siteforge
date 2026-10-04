import type { Finding, score } from "@/lib/audit/schema";
export interface StoredIssue {
  id: string;
  data: Finding;
  status: "open" | "resolved" | "ignored";
}
export interface Snapshot {
  audit: {
    id: string;
    project_id: string;
    url: string;
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
