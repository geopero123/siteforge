import type { AIProvider } from "../ai/provider";
import type { AuditEvent, Finding } from "../audit/schema";
import { fetchRepositorySnapshot, type RepositorySnapshot } from "./github";
import { parseRepository } from "./reference";
import { scanConfiguration, scanPatterns } from "./rules";
import { collectDependencies, scanDependencies } from "./dependencies";
import { reviewRepository } from "./review";
import { sourceFinding, type SourceIssue } from "./findings";

export interface RepositoryReport {
  name: string;
  branch: string;
  commit?: string;
  files: number;
  analyzedFiles: number;
  dependencies: number;
  reviewedFiles: number;
  skippedFiles: number;
  rejectedAIFindings: number;
}

export async function scanRepository(options: {
  repository: string;
  userId?: string;
  ai?: AIProvider;
  signal?: AbortSignal;
  event: (event: AuditEvent) => Promise<void>;
  snapshot?: RepositorySnapshot;
}) {
  const { event, signal } = options;
  const warnings: string[] = [];
  const checks: Record<string, string> = {};
  const reference = parseRepository(options.repository);
  await event({
    agent: "code",
    status: "running",
    message: `Downloading ${reference.owner}/${reference.repo}${reference.ref ? "@" + reference.ref : ""}`,
  });
  const snapshot =
    options.snapshot ??
    (await fetchRepositorySnapshot(reference, options.userId, signal));
  const analyzed = snapshot.files.filter((file) => file.text !== undefined);
  if (snapshot.truncated)
    warnings.push(
      "Repository has more files than one scan covers; later files were not indexed.",
    );
  await event({
    agent: "code",
    status: "complete",
    message: `Indexed ${snapshot.files.length} files on ${snapshot.branch}${snapshot.commit ? " @ " + snapshot.commit.slice(0, 7) : ""}`,
  });

  const issues: SourceIssue[] = [
    ...scanConfiguration(snapshot.files),
    ...scanPatterns(snapshot.files),
  ];
  await event({
    agent: "code",
    status: "complete",
    message: `Static checks found ${issues.length} secret, configuration and code-pattern issues`,
  });
  checks.staticAnalysis = `Secrets, dangerous code patterns, CI, container and config rules over ${analyzed.length} text files`;

  const { dependencies, errors } = collectDependencies(snapshot.files);
  warnings.push(...errors);
  if (dependencies.length) {
    await event({
      agent: "dependencies",
      status: "running",
      message: `Checking ${dependencies.length} locked package versions against OSV.dev`,
    });
    try {
      const vulnerable = await scanDependencies(dependencies, signal);
      issues.push(...vulnerable);
      checks.dependencies = `${dependencies.length} locked versions checked on OSV.dev`;
      await event({
        agent: "dependencies",
        status: "complete",
        message: `${vulnerable.length} vulnerable packages found`,
      });
    } catch (e) {
      if (signal?.aborted) throw e;
      warnings.push(
        `Dependency vulnerability lookup failed: ${(e as Error).message}`,
      );
      checks.dependencies = "Unavailable: OSV.dev lookup failed";
    }
  } else {
    checks.dependencies =
      "No supported lockfile found (npm, yarn, pnpm, pip, poetry, uv, Pipfile, Cargo, Go, Bundler, Composer)";
  }

  let summary = "";
  let review = { reviewedFiles: 0, skippedFiles: 0, rejected: 0 };
  if (options.ai) {
    try {
      const result = await reviewRepository(
        options.ai,
        snapshot.files,
        issues,
        {
          signal,
          onBatch: (index, total, paths) =>
            event({
              agent: "code",
              status: "running",
              message: `AI review ${index + 1}/${total}: ${paths.length} files (${paths.slice(0, 3).join(", ")}${paths.length > 3 ? ", …" : ""})`,
            }),
        },
      );
      issues.push(...result.issues);
      warnings.push(...result.errors);
      review = result;
      summary = result.summaries.filter(Boolean).join(" ");
      if (result.skippedFiles)
        warnings.push(
          `AI review covered ${result.reviewedFiles} source files; ${result.skippedFiles} lower-priority files were only checked by static rules.`,
        );
      checks.aiReview = `${result.reviewedFiles} source files reviewed; ${result.rejected} unverifiable AI claims discarded`;
      await event({
        agent: "code",
        status: "complete",
        message: `AI review added ${result.issues.length} verified findings`,
      });
    } catch (e) {
      if (signal?.aborted) throw e;
      warnings.push(`AI code review failed: ${(e as Error).message}`);
    }
  } else {
    checks.aiReview = "Unavailable: configure Gemini";
  }

  const findings: Finding[] = issues.map((issue) =>
    sourceFinding(snapshot, issue),
  );
  const report: RepositoryReport = {
    name: `${reference.owner}/${reference.repo}`,
    branch: snapshot.branch,
    commit: snapshot.commit,
    files: snapshot.files.length,
    analyzedFiles: analyzed.length,
    dependencies: dependencies.length,
    reviewedFiles: review.reviewedFiles,
    skippedFiles: review.skippedFiles,
    rejectedAIFindings: review.rejected,
  };
  return { findings, warnings, checks, summary, snapshot, report };
}
