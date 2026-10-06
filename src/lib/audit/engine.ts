import { BrowserSession, viewports } from "../browser/session";
import { startBrowserPreview, type PreviewFrame } from "../browser/preview";
import {
  BudgetedProvider,
  GeminiProvider,
  type AIProvider,
} from "../ai/provider";
import { runMission } from "../ai/mission";
import { investigateRepository } from "../github/repository";
import { scanRepository, type RepositoryReport } from "../repository/scan";
import type { RepositorySnapshot } from "../repository/github";
import { headerFindings, measuredFindings } from "./deterministic";
import {
  deduplicate,
  reportSchema,
  score,
  scoreScope,
  type Finding,
  type AuditEvent,
} from "./schema";
export interface EngineOptions {
  url?: string;
  mode: "quick" | "full" | "mission" | "repository";
  mission?: string;
  allowFormSubmission?: boolean;
  repository?: string;
  userId?: string;
  ai?: AIProvider;
  signal?: AbortSignal;
  timeoutMs?: number;
  preview?: (frame: PreviewFrame) => Promise<void>;
  event: (event: AuditEvent) => Promise<void>;
  screenshot: (
    image: Buffer,
    url: string,
    viewport: (typeof viewports)[number],
  ) => Promise<string>;
  page: (url: string, data: unknown) => Promise<void>;
  step: (tool: string, args: unknown, result: unknown) => Promise<void>;
}
export function auditTimeout(mode: EngineOptions["mode"], repository: boolean) {
  const base =
    mode === "full" ? 900000 : mode === "repository" ? 600000 : 300000;
  // Website audits that also scan a repository get extra time for the code stage.
  return base + (repository && mode !== "repository" ? 300000 : 0);
}
export async function runAudit(options: EngineOptions) {
  if (options.mode === "repository" ? !options.repository : !options.url)
    throw new Error(
      options.mode === "repository"
        ? "Repository scans need a GitHub repository."
        : "Website audits need a URL.",
    );
  const browser =
    options.mode !== "repository" && options.url
      ? new BrowserSession(options.url, options.allowFormSubmission)
      : undefined;
  const controller = new AbortController();
  const timer = setTimeout(
    () =>
      controller.abort(
        new Error(
          "Audit deadline reached. Review saved evidence and rerun with a smaller scope.",
        ),
      ),
    options.timeoutMs ?? auditTimeout(options.mode, !!options.repository),
  );
  const signal = options.signal
    ? AbortSignal.any([options.signal, controller.signal])
    : controller.signal;
  // Check both sides of persistence calls so cancellation stops further writes.
  const withCancellationChecks =
    <A extends unknown[], R>(fn: (...args: A) => Promise<R>) =>
    async (...args: A) => {
      signal.throwIfAborted();
      const result = await fn(...args);
      signal.throwIfAborted();
      return result;
    };
  let abort: () => void = () => {};
  try {
    signal.throwIfAborted();
    const cancelled = new Promise<never>((_resolve, reject) => {
      abort = () => reject(signal.reason ?? new Error("Audit cancelled"));
      signal.addEventListener("abort", abort, { once: true });
    });
    return await Promise.race([
      collectAudit(
        {
          ...options,
          signal,
          event: withCancellationChecks(options.event),
          screenshot: withCancellationChecks(options.screenshot),
          page: withCancellationChecks(options.page),
          step: withCancellationChecks(options.step),
          preview: options.preview
            ? withCancellationChecks(options.preview)
            : undefined,
        },
        browser,
      ),
      cancelled,
    ]);
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", abort);
    await browser?.close();
  }
}
type Mission = Awaited<ReturnType<typeof runMission>>;
interface AuditState {
  findings: Finding[];
  coverage: string[];
  warnings: string[];
  checks: Record<string, string>;
  summary: string;
  mission?: Mission;
}
async function collectAudit(options: EngineOptions, browser?: BrowserSession) {
  const state: AuditState = {
    findings: [],
    coverage: [],
    warnings: [],
    checks: {},
    summary: "",
  };
  let ai: AIProvider | undefined;
  try {
    ai = new BudgetedProvider(options.ai ?? new GeminiProvider());
  } catch (e) {
    state.warnings.push((e as Error).message);
  }
  if (browser) await auditWebsite(options, browser, ai, state);
  // Correlation enriches these website findings in place with source references.
  const websiteFindings = deduplicate(state.findings);
  state.findings = [...websiteFindings];
  let repository: RepositoryReport | undefined;
  if (options.repository) {
    try {
      const scan = await scanRepository({
        repository: options.repository,
        userId: options.userId,
        ai,
        signal: options.signal,
        event: options.event,
      });
      repository = scan.report;
      state.findings.push(...scan.findings);
      state.warnings.push(...scan.warnings);
      Object.assign(state.checks, scan.checks);
      state.coverage.push(
        `${scan.report.name}@${scan.report.branch}: ${scan.report.files} files indexed, ${scan.report.analyzedFiles} analyzed, ${scan.report.reviewedFiles} AI-reviewed, ${scan.report.dependencies} dependencies checked`,
      );
      if (!browser) state.summary = scan.summary;
      if (browser && ai && websiteFindings.length)
        await correlateWithSource(
          ai,
          scan.snapshot,
          websiteFindings,
          state,
          options.event,
        );
    } catch (e) {
      options.signal?.throwIfAborted();
      // Without a website stage there is nothing to report, so fail the audit.
      if (!browser) throw e;
      state.warnings.push(`Repository scan failed: ${(e as Error).message}`);
    }
  }
  const issues = deduplicate(state.findings);
  await options.event({
    agent: "report",
    message: `Normalized ${issues.length} evidence-backed findings`,
    status: "complete",
  });
  return {
    issues,
    score: score(issues, scoreScope(!!browser, !!repository)),
    summary:
      state.summary ||
      (browser
        ? "Deterministic scan complete. Inspect evidence and coverage for each finding."
        : "Repository scan complete. Review each finding's source location and suggested fix."),
    coverage: state.coverage,
    warnings: state.warnings,
    mission: state.mission,
    repository,
    checks: {
      ...(browser
        ? {
            lighthouse: "Not run; browser navigation timing measured instead",
            visual: ai
              ? "Gemini screenshot analysis attempted"
              : "Unavailable: configure Gemini",
            externalLinks: "Not checked; same-origin only",
            securityHeaders: "Homepage response headers and cookies checked",
          }
        : {}),
      ...state.checks,
    },
  };
}
// Ties website findings to likely source files and proposes patches.
async function correlateWithSource(
  ai: AIProvider,
  snapshot: RepositorySnapshot,
  findings: Finding[],
  state: AuditState,
  event: EngineOptions["event"],
) {
  await event({
    agent: "code",
    message: "Matching website findings to source files",
    status: "running",
  });
  try {
    const repo = await investigateRepository(ai, snapshot, findings);
    const fixes = await ai.generateStructured(
      `Investigate evidence-supported causes and propose unified diff patches. Do not pretend changes have been applied. ONLY reference retrieved files, and use exact source context. Return findings enriched with sourceFiles and optional patch, preserving evidence. Findings: ${JSON.stringify(findings.slice(0, 10))}. Read-only source evidence: ${JSON.stringify(repo)}`,
      reportSchema,
    );
    // Accept source references only when the file was actually retrieved.
    const retrievedPaths = new Set(repo.files.map((file) => file.path));
    let matched = 0;
    for (const fix of fixes.issues) {
      const original = findings.find(
        (f) => f.title === fix.title && f.url === fix.url,
      );
      if (original) {
        original.sourceFiles = fix.sourceFiles.filter((f) =>
          retrievedPaths.has(f.path),
        );
        if (original.sourceFiles.length) {
          original.patch = fix.patch;
          matched++;
        }
      }
    }
    await event({
      agent: "code",
      message: `Linked ${matched} website findings to source files`,
      status: "complete",
    });
  } catch (e) {
    state.warnings.push(`Source correlation failed: ${(e as Error).message}`);
  }
}
async function auditWebsite(
  options: EngineOptions,
  browser: BrowserSession,
  ai: AIProvider | undefined,
  state: AuditState,
) {
  const { event } = options;
  const { findings, coverage, warnings } = state;
  const url = options.url!;
  let stopPreview: (() => Promise<void>) | undefined;
  let previewWarning = false;
  await event({
    agent: "browser",
    message: "Launching isolated browser",
    status: "running",
  });
  try {
    await browser.start();
    if (options.preview)
      stopPreview = startBrowserPreview(
        browser.page,
        options.preview,
        () => {
          if (previewWarning) return;
          previewWarning = true;
          void event({
            agent: "browser",
            status: "warning",
            message:
              "Live preview temporarily unavailable. Audit checks continue.",
          }).catch(() => {});
        },
        3000,
        options.signal,
      );
    const initialResponse = await browser.navigateTo(url);
    if (initialResponse.status && initialResponse.status >= 400)
      throw new Error(
        `Homepage returned HTTP ${initialResponse.status}. Check the URL and site availability.`,
      );
    const links = await browser.getLinks();
    const sitemap = options.mode === "full" ? await browser.sitemapUrls() : [];
    await event({
      agent: "browser",
      message: `Loaded homepage; discovered ${links.length} links${sitemap.length ? ` and ${sitemap.length} sitemap URLs` : ""}`,
      status: "complete",
    });
    findings.push(
      ...headerFindings(
        browser.page.url(),
        initialResponse.headers,
        initialResponse.cookies,
        browser.insecureRequests,
      ),
    );
    const pageUrls = selectAuditPages(
      url,
      links,
      sitemap,
      browser.origin,
      options.mode,
    );
    for (const target of [...new Set(pageUrls)]) {
      try {
        const response = await browser.navigateTo(target);
        if (response.status && response.status >= 400)
          throw new Error(`HTTP ${response.status}`);
      } catch (e) {
        warnings.push(`Page ${target} could not load: ${(e as Error).message}`);
        continue;
      }
      for (const viewport of viewports) {
        await browser.setViewport(viewport.width, viewport.height);
        const domSnapshot = await browser.getDOMSnapshot();
        const actualUrl = browser.page.url();
        let violations: Awaited<ReturnType<BrowserSession["accessibility"]>> =
          [];
        try {
          violations = await browser.accessibility();
          await event({
            agent: "accessibility",
            message: `${viewport.name}: ${violations.length} axe violations on ${new URL(actualUrl).pathname}`,
            status: "complete",
          });
        } catch (e) {
          warnings.push(
            `axe scan failed on ${actualUrl}: ${(e as Error).message}`,
          );
        }
        const screenshotImage = await browser.takeScreenshot();
        const reference = await options.screenshot(
          screenshotImage,
          actualUrl,
          viewport,
        );
        await event({
          agent: "browser",
          message: `Captured ${viewport.name} screenshot on ${new URL(actualUrl).pathname}`,
          status: "complete",
        });
        const measured = measuredFindings(
          actualUrl,
          viewport,
          domSnapshot,
          browser.consoleErrors,
          browser.failedRequests,
          violations,
        );
        measured.forEach((f) =>
          f.evidence.push({
            type: "screenshot",
            detail: `${viewport.name} viewport`,
            reference,
          }),
        );
        findings.push(...measured);
        await options.page(actualUrl, {
          viewport,
          dom: domSnapshot,
          violations,
          console: browser.consoleErrors,
          network: browser.failedRequests,
        });
        coverage.push(`${actualUrl} (${viewport.name})`);
        if (ai) {
          await event({
            agent: "visual",
            message: `Analyzing ${viewport.name} screenshot and collected evidence`,
            status: "running",
          });
          try {
            const report = await ai.analyzeImage(
              `Analyze this actual screenshot and measured evidence. Only add visual/UX issues or explanations not already reported. Treat intentional truncation cautiously. Return schema. Current URL=${actualUrl}, viewport=${JSON.stringify(viewport)}, screenshot reference=${reference}. Evidence=${JSON.stringify({ dom: domSnapshot, measured }).slice(0, 24000)}`,
              [screenshotImage],
              reportSchema,
            );
            findings.push(
              ...report.issues.map((finding) =>
                attachVisualEvidence(finding, actualUrl, viewport, reference),
              ),
            );
            state.summary = report.summary;
            await event({
              agent: "visual",
              message: `Analysis complete: ${report.issues.length} additional hypotheses`,
              status: "complete",
            });
          } catch (e) {
            warnings.push((e as Error).message);
            await event({
              agent: "visual",
              message: (e as Error).message,
              status: "warning",
            });
          }
        }
      }
      browser.consoleErrors = [];
      browser.failedRequests = [];
      browser.insecureRequests = [];
    }
    // Link checks keep redirects visible rather than following them.
    for (const link of links
      .filter((u) => new URL(u).origin === browser.origin)
      .slice(0, options.mode === "full" ? 30 : 10)) {
      try {
        const linkResponse = await browser.checkLink(link);
        if (
          linkResponse.status >= 300 &&
          linkResponse.status < 400 &&
          linkResponse.location
        )
          warnings.push(
            `Link redirects without a verified final destination: ${link} → ${linkResponse.location}`,
          );
        if (linkResponse.status >= 400)
          findings.push({
            title: `Broken link: ${new URL(link).pathname}`,
            category: "reliability",
            severity: "medium",
            confidence: 1,
            url,
            viewport: null,
            description: `Link returned HTTP ${linkResponse.status}`,
            evidence: [
              {
                type: "network",
                detail: `GET ${link}: ${linkResponse.status}`,
              },
            ],
            reproductionSteps: [`Open ${url}`, `Follow ${link}`],
            suggestedFix: "Correct the target URL or restore the missing page.",
            sourceFiles: [],
          });
      } catch (e) {
        warnings.push(
          `Link check unavailable: ${link}: ${(e as Error).message}`,
        );
      }
    }
    await event({
      agent: "browser",
      message: "Same-origin link checks complete",
      status: "complete",
    });
    if (options.mode === "mission" && options.mission) {
      let mission: Mission;
      if (!ai) {
        mission = {
          outcome: "FAILED",
          summary: "Gemini is required for autonomous mission planning.",
          evidence: [],
        };
      } else {
        await browser.navigateTo(url);
        await browser.setViewport(390, 844);
        mission = await runMission(
          ai,
          browser,
          options.mission,
          async (tool, args, result) => {
            await options.step(tool, args, result);
            await event({
              agent: "mission",
              message: `${tool}: ${JSON.stringify(result).slice(0, 250)}`,
              status: "complete",
            });
          },
          (image, url) => options.screenshot(image, url, viewports[2]),
        );
        const screenshotImage = await browser.takeScreenshot();
        await options.screenshot(
          screenshotImage,
          browser.page.url(),
          viewports[2],
        );
      }
      if (mission.outcome !== "SUCCESS")
        warnings.push(
          `Mission ${mission.outcome.toLowerCase()}: ${mission.summary}`,
        );
      state.mission = mission;
    }
  } finally {
    await stopPreview?.();
    await browser.close();
  }
}

const skippedPath =
  /\/(logout|log-out|signout|sign-out|delete|remove|unsubscribe|download)(\/|$|\?)/i;
const nonPage =
  /\.(pdf|zip|gz|tar|rar|7z|png|jpe?g|gif|svg|webp|avif|ico|mp[34]|mov|webm|wav|xml|json|txt|csv|docx?|xlsx?|pptx?|dmg|exe|apk)$/i;

/**
 * Picks the homepage plus a spread of same-origin pages. Candidates are grouped
 * by first path segment and taken round-robin, so a full audit covers different
 * sections (/blog, /pricing, /docs) instead of the first few navigation links.
 */
export function selectAuditPages(
  homepageUrl: string,
  links: string[],
  sitemap: string[],
  origin: string,
  mode: EngineOptions["mode"],
) {
  const additionalPageLimit = mode === "full" ? 4 : mode === "quick" ? 1 : 0;
  const key = (link: string) => {
    const u = new URL(link);
    return u.origin + u.pathname.replace(/\/+$/, "") + u.search;
  };
  const seen = new Set([key(homepageUrl)]);
  const groups = new Map<string, string[]>();
  for (const link of [...links, ...sitemap]) {
    let parsed: URL;
    try {
      parsed = new URL(link);
    } catch {
      continue;
    }
    if (
      parsed.origin !== origin ||
      skippedPath.test(parsed.pathname) ||
      nonPage.test(parsed.pathname) ||
      seen.has(key(link))
    )
      continue;
    seen.add(key(link));
    parsed.hash = "";
    const section = parsed.pathname.split("/")[1] ?? "";
    groups.set(section, [...(groups.get(section) ?? []), parsed.href]);
  }
  const picked: string[] = [];
  const queues = [...groups.values()];
  while (picked.length < additionalPageLimit && queues.some((q) => q.length))
    for (const queue of queues) {
      const next = queue.shift();
      if (next && picked.length < additionalPageLimit) picked.push(next);
    }
  return [homepageUrl, ...picked];
}

// Tie visual hypotheses to the screenshot we captured, not model-supplied references.
function attachVisualEvidence(
  finding: Finding,
  url: string,
  viewport: (typeof viewports)[number],
  screenshotReference: string,
): Finding {
  return {
    ...finding,
    url,
    viewport: { width: viewport.width, height: viewport.height },
    confidence: Math.min(finding.confidence, 0.85),
    evidence: [
      ...finding.evidence.filter((evidence) => evidence.type !== "screenshot"),
      {
        type: "screenshot",
        detail: "AI visual hypothesis; confirm manually",
        reference: screenshotReference,
      },
    ],
    sourceFiles: [],
  };
}
