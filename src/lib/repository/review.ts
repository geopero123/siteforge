import { z } from "zod";
import type { AIProvider } from "../ai/provider";
import type { RepositoryFile } from "./github";
import type { SourceIssue } from "./findings";
import { lineOf } from "./findings";
import { isAnalyzable, sourceExtension } from "./rules";

const reviewSchema = z.object({
  issues: z
    .array(
      z.object({
        title: z.string().min(3).max(180),
        category: z.enum([
          "security",
          "reliability",
          "code",
          "performance",
          "accessibility",
          "seo",
          "ux",
        ]),
        severity: z.enum(["critical", "high", "medium", "low", "info"]),
        confidence: z.number().min(0).max(1),
        path: z.string().max(500),
        snippet: z.string().min(3).max(1500),
        description: z.string().max(3000),
        suggestedFix: z.string().max(3000),
        patch: z.string().max(12000).optional(),
      }),
    )
    .max(20),
  summary: z.string().max(2000),
});

// Paths that usually carry the riskiest logic are reviewed first.
const priority =
  /(auth|login|session|token|password|secret|crypt|payment|billing|checkout|webhook|stripe|admin|api\/|routes?\/|controllers?\/|handlers?\/|middleware|proxy|server|db|database|sql|query|upload|permission|policy|security|config)/i;

export function selectReviewFiles(files: RepositoryFile[], maxChars: number) {
  const candidates = files.filter(
    (file) =>
      isAnalyzable(file) &&
      sourceExtension.test(file.path) &&
      !/\.d\.ts$|(^|\/)(migrations?|generated|__generated__|locales?|i18n)\//i.test(
        file.path,
      ) &&
      !/\.(test|spec)\.[a-z]+$|(^|\/)(tests?|__tests__|fixtures?)\//i.test(
        file.path,
      ) &&
      file.text!.length <= 60000 &&
      file.text!.trim().length > 0,
  );
  candidates.sort((a, b) => {
    const rank = (file: RepositoryFile) =>
      (priority.test(file.path) ? 0 : 1) * 10 +
      Math.min(9, file.path.split("/").length);
    return rank(a) - rank(b) || a.text!.length - b.text!.length;
  });
  const selected: RepositoryFile[] = [];
  let total = 0;
  for (const file of candidates) {
    if (total + file.text!.length > maxChars) continue;
    selected.push(file);
    total += file.text!.length;
  }
  return { selected, skipped: candidates.length - selected.length };
}

function batches(files: RepositoryFile[], size: number) {
  const out: RepositoryFile[][] = [];
  let current: RepositoryFile[] = [],
    length = 0;
  for (const file of files) {
    if (current.length && length + file.text!.length > size) {
      out.push(current);
      current = [];
      length = 0;
    }
    current.push(file);
    length += file.text!.length;
  }
  if (current.length) out.push(current);
  return out;
}

function normalize(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

/** Locates a quoted snippet in the file, tolerating whitespace differences. */
export function locateSnippet(text: string, snippet: string) {
  const exact = text.indexOf(snippet);
  if (exact !== -1) return lineOf(text, exact);
  const first = normalize(
    snippet.split("\n").find((line) => line.trim().length > 2) ?? "",
  );
  if (first.length < 3) return undefined;
  const lines = text.split("\n");
  const index = lines.findIndex((line) => normalize(line).includes(first));
  return index === -1 ? undefined : index + 1;
}

/** Accepts a patch only if every removed line actually exists in the target file. */
export function validatePatch(patch: string, path: string, text: string) {
  const touched = [...patch.matchAll(/^(?:\+\+\+|---) (?:[ab]\/)?(\S+)/gm)].map(
    (m) => m[1],
  );
  if (
    !touched.length ||
    touched.some((file) => file !== path && file !== "/dev/null")
  )
    return false;
  if (!/^@@ /m.test(patch)) return false;
  const source = new Set(text.split("\n").map(normalize));
  return patch
    .split("\n")
    .filter((line) => line.startsWith("-") && !line.startsWith("---"))
    .every((line) => source.has(normalize(line.slice(1))));
}

export interface ReviewResult {
  issues: SourceIssue[];
  summaries: string[];
  reviewedFiles: number;
  skippedFiles: number;
  rejected: number;
  errors: string[];
}

export async function reviewRepository(
  ai: AIProvider,
  files: RepositoryFile[],
  known: SourceIssue[],
  options: {
    maxChars?: number;
    batchChars?: number;
    maxBatches?: number;
    signal?: AbortSignal;
    onBatch?: (index: number, total: number, paths: string[]) => Promise<void>;
  } = {},
): Promise<ReviewResult> {
  const maxBatches =
    options.maxBatches ?? (Number(process.env.REPO_REVIEW_MAX_BATCHES) || 8);
  const batchChars = options.batchChars ?? 40000;
  const { selected, skipped } = selectReviewFiles(
    files,
    options.maxChars ?? batchChars * maxBatches,
  );
  const groups = batches(selected, batchChars).slice(0, maxBatches);
  const reviewed = groups.flat();
  const byPath = new Map(files.map((file) => [file.path, file]));
  const index = files
    .filter((file) => isAnalyzable(file))
    .map((file) => file.path)
    .slice(0, 600)
    .join("\n");
  const knownList = known
    .slice(0, 80)
    .map(
      (issue) =>
        `${issue.path}${issue.line ? ":" + issue.line : ""} ${issue.title}`,
    )
    .join("\n");
  const result: ReviewResult = {
    issues: [],
    summaries: [],
    reviewedFiles: reviewed.length,
    skippedFiles: skipped + (selected.length - reviewed.length),
    rejected: 0,
    errors: [],
  };
  for (const [batchIndex, group] of groups.entries()) {
    options.signal?.throwIfAborted();
    await options.onBatch?.(
      batchIndex,
      groups.length,
      group.map((file) => file.path),
    );
    const body = group
      .map((file) => `===== FILE: ${file.path} =====\n${file.text}`)
      .join("\n\n");
    try {
      const review = await ai.generateStructured(
        `Review these repository files as a senior engineer and security reviewer. Find real defects: security vulnerabilities (injection, auth/authorization gaps, SSRF, XSS, secrets, insecure crypto, missing validation), correctness bugs (wrong logic, unhandled errors or promises, race conditions, resource leaks, broken edge cases), performance problems, and accessibility problems in UI code. Ignore style preferences and anything already listed under KNOWN.
Rules: Every issue must cite one file from this batch in "path" and quote 1-6 lines of that file EXACTLY in "snippet". Do not report anything you cannot quote. Severity reflects real-world impact. Give a concrete suggestedFix. When the fix is local, add "patch": a unified diff (--- a/<path>, +++ b/<path>, @@ hunks) against the quoted code. Return an empty list if nothing is wrong.
REPOSITORY FILE INDEX (context only):
${index}
KNOWN (already reported, do not repeat):
${knownList || "none"}
FILES:
${body}`,
        reviewSchema,
      );
      result.summaries.push(review.summary);
      for (const issue of review.issues) {
        const file = byPath.get(issue.path.replace(/^\.?\//, ""));
        const line = file?.text
          ? locateSnippet(file.text, issue.snippet)
          : undefined;
        // Drop anything we cannot tie to real code: these are hallucinations.
        if (!file?.text || !line || !group.includes(file)) {
          result.rejected++;
          continue;
        }
        result.issues.push({
          title: issue.title,
          category: issue.category,
          severity: issue.severity,
          confidence: Math.min(issue.confidence, 0.8),
          path: file.path,
          line,
          snippet: issue.snippet.slice(0, 1200),
          description:
            issue.description +
            "\n\nAI code review finding; confirm before acting.",
          suggestedFix: issue.suggestedFix,
          ...(issue.patch && validatePatch(issue.patch, file.path, file.text)
            ? { patch: issue.patch }
            : {}),
        });
      }
    } catch (e) {
      if (options.signal?.aborted) throw e;
      result.errors.push(
        `AI review of ${group.length} files failed: ${(e as Error).message}`,
      );
      if (/budget/i.test((e as Error).message)) break;
    }
  }
  return result;
}
