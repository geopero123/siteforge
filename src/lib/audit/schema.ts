import { z } from "zod";
import { repositoryReferenceSchema } from "../repository/reference";
export const categories = [
  "performance",
  "accessibility",
  "seo",
  "ux",
  "reliability",
  "responsive",
  "security",
  "code",
  "dependencies",
] as const;
export type Category = (typeof categories)[number];
// Each audit is scored only over the categories its checks can observe.
export const websiteCategories: Category[] = [
  "performance",
  "accessibility",
  "seo",
  "ux",
  "reliability",
  "responsive",
  "security",
];
export const repositoryCategories: Category[] = [
  "security",
  "reliability",
  "code",
  "dependencies",
];
export function scoreScope(website: boolean, repository: boolean) {
  return categories.filter(
    (category) =>
      (website && websiteCategories.includes(category)) ||
      (repository && repositoryCategories.includes(category)),
  );
}
export const severities = [
  "critical",
  "high",
  "medium",
  "low",
  "info",
] as const;
export const evidenceSchema = z.object({
  type: z.enum([
    "screenshot",
    "console",
    "network",
    "axe",
    "dom",
    "metadata",
    "metric",
    "source",
    "dependency",
    "header",
  ]),
  detail: z.string().max(4000),
  reference: z.string().max(1000).optional(),
});
export const findingSchema = z.object({
  title: z.string().min(3).max(180),
  category: z.enum(categories),
  severity: z.enum(severities),
  confidence: z.number().min(0).max(1),
  url: z.string().max(2000),
  viewport: z.object({ width: z.number(), height: z.number() }).nullable(),
  description: z.string().max(5000),
  evidence: z.array(evidenceSchema).min(1).max(20),
  reproductionSteps: z.array(z.string().max(1000)).max(15),
  suggestedFix: z.string().max(5000),
  sourceFiles: z
    .array(
      z.object({ path: z.string(), lines: z.string(), reason: z.string() }),
    )
    .max(10),
  patch: z.string().max(20000).optional(),
});
export type Finding = z.infer<typeof findingSchema>;
export type Issue = Finding & {
  id: string;
  status: "open" | "resolved" | "ignored";
};
export const reportSchema = z.object({
  issues: z.array(findingSchema).max(60),
  summary: z.string().max(5000),
});
export const auditModes = ["quick", "full", "mission", "repository"] as const;
export const auditInputSchema = z
  .object({
    projectId: z.uuid(),
    url: z.url().max(2000).optional(),
    repository: repositoryReferenceSchema.optional(),
    mode: z.enum(auditModes),
    mission: z.string().max(1000).optional(),
    allowFormSubmission: z.boolean().default(false),
  })
  .superRefine((input, context) => {
    if (input.mode === "mission" && !input.mission?.trim())
      context.addIssue({
        code: "custom",
        message: "Provide a mission objective",
        path: ["mission"],
      });
    if (input.mode === "repository" && !input.repository)
      context.addIssue({
        code: "custom",
        message: "Provide a GitHub repository to scan",
        path: ["repository"],
      });
    if (input.mode !== "repository" && !input.url)
      context.addIssue({
        code: "custom",
        message: "Provide a website URL",
        path: ["url"],
      });
  });
export type AuditInput = z.infer<typeof auditInputSchema>;
export interface AuditEvent {
  agent: string;
  message: string;
  status: "running" | "complete" | "warning" | "failed";
  at?: string;
}
export function deduplicate(findings: Finding[]): Finding[] {
  const findingsByKey = new Map<string, Finding>();
  for (const finding of findings) {
    // Layout findings vary by viewport; other categories merge across viewports.
    const key = [
      finding.category,
      finding.url,
      finding.category === "responsive" || finding.category === "ux"
        ? (finding.viewport?.width ?? "")
        : "",
      finding.title.toLowerCase().replace(/[^a-z0-9]/g, ""),
    ].join("|");
    const previousFinding = findingsByKey.get(key);
    if (!previousFinding) {
      findingsByKey.set(key, { ...finding, evidence: [...finding.evidence] });
    } else {
      const strongestFinding =
        previousFinding.confidence < finding.confidence
          ? finding
          : previousFinding;
      const evidence = [...previousFinding.evidence, ...finding.evidence]
        .filter(
          (item, index, allEvidence) =>
            allEvidence.findIndex(
              (candidate) => JSON.stringify(candidate) === JSON.stringify(item),
            ) === index,
        )
        .slice(0, 20);
      findingsByKey.set(key, { ...strongestFinding, evidence });
    }
  }
  return [...findingsByKey.values()];
}
export function score(
  issues: Array<Finding & { status?: string }>,
  scope: readonly Category[] = websiteCategories,
) {
  // Only open findings lower the score, weighted by severity and confidence.
  const weights = { critical: 30, high: 15, medium: 7, low: 2, info: 0 };
  const categoryScores = Object.fromEntries(
    scope.map((category) => {
      const totalPenalty = issues
        .filter(
          (issue) =>
            issue.category === category &&
            (!issue.status || issue.status === "open"),
        )
        .reduce(
          (penalty, issue) =>
            penalty + weights[issue.severity] * issue.confidence,
          0,
        );
      const categoryScore = Math.max(0, Math.round(100 - totalPenalty));
      return [category, categoryScore];
    }),
  ) as Partial<Record<Category, number>>;
  const values = Object.values(categoryScores) as number[];
  return {
    overall: values.length
      ? Math.round(
          values.reduce((total, value) => total + value, 0) / values.length,
        )
      : 100,
    categories: categoryScores,
  };
}
