import { z } from "zod";
export const categories = [
  "performance",
  "accessibility",
  "seo",
  "ux",
  "reliability",
  "responsive",
] as const;
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
export const auditInputSchema = z
  .object({
    projectId: z.uuid(),
    url: z.url().max(2000),
    mode: z.enum(["quick", "full", "mission"]),
    mission: z.string().max(1000).optional(),
    allowFormSubmission: z.boolean().default(false),
  })
  .superRefine((v, c) => {
    if (v.mode === "mission" && !v.mission?.trim())
      c.addIssue({
        code: "custom",
        message: "Provide a mission objective",
        path: ["mission"],
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
  const map = new Map<string, Finding>();
  for (const f of findings) {
    const key = [
      f.category,
      f.url,
      f.category === "responsive" || f.category === "ux"
        ? (f.viewport?.width ?? "")
        : "",
      f.title.toLowerCase().replace(/[^a-z0-9]/g, ""),
    ].join("|");
    const prior = map.get(key);
    if (!prior) {
      map.set(key, { ...f, evidence: [...f.evidence] });
    } else {
      const strongest = prior.confidence < f.confidence ? f : prior;
      const evidence = [...prior.evidence, ...f.evidence]
        .filter(
          (e, i, all) =>
            all.findIndex((v) => JSON.stringify(v) === JSON.stringify(e)) === i,
        )
        .slice(0, 20);
      map.set(key, { ...strongest, evidence });
    }
  }
  return [...map.values()];
}
export function score(issues: Array<Finding & { status?: string }>) {
  const weights = { critical: 30, high: 15, medium: 7, low: 2, info: 0 };
  const subs = Object.fromEntries(
    categories.map((c) => [
      c,
      Math.max(
        0,
        Math.round(
          100 -
            issues
              .filter(
                (i) => i.category === c && (!i.status || i.status === "open"),
              )
              .reduce((n, i) => n + weights[i.severity] * i.confidence, 0),
        ),
      ),
    ]),
  ) as Record<(typeof categories)[number], number>;
  return {
    overall: Math.round(
      Object.values(subs).reduce((a, b) => a + b, 0) / categories.length,
    ),
    categories: subs,
  };
}
