import { BrowserSession, viewports } from "../browser/session";
import { startBrowserPreview, type PreviewFrame } from "../browser/preview";
import { GeminiProvider, type AIProvider } from "../ai/provider";
import { runMission } from "../ai/mission";
import { investigateRepository } from "../github/repository";
import { measuredFindings } from "./deterministic";
import {
  deduplicate,
  reportSchema,
  score,
  type Finding,
  type AuditEvent,
} from "./schema";
export interface EngineOptions {
  url: string;
  mode: "quick" | "full" | "mission";
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
export async function runAudit(options: EngineOptions) {
  const browser = new BrowserSession(options.url, options.allowFormSubmission);
  const controller = new AbortController();
  const timer = setTimeout(
    () =>
      controller.abort(
        new Error(
          "Audit deadline reached. Review saved evidence and rerun with a smaller scope.",
        ),
      ),
    options.timeoutMs ?? (options.mode === "full" ? 900000 : 300000),
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
    await browser.close();
  }
}
async function collectAudit(options: EngineOptions, browser: BrowserSession) {
  const { event } = options;
  const findings: Finding[] = [];
  const coverage: string[] = [];
  const warnings: string[] = [];
  let summary = "";
  let mission: Awaited<ReturnType<typeof runMission>> | undefined;
  let ai: AIProvider | undefined = options.ai;
  let stopPreview: (() => Promise<void>) | undefined;
  let previewWarning = false;
  try {
    ai ??= new GeminiProvider();
  } catch (e) {
    warnings.push((e as Error).message);
  }
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
    const initialResponse = await browser.navigateTo(options.url);
    if (initialResponse.status && initialResponse.status >= 400)
      throw new Error(
        `Homepage returned HTTP ${initialResponse.status}. Check the URL and site availability.`,
      );
    const links = await browser.getLinks();
    await event({
      agent: "browser",
      message: `Loaded homepage; discovered ${links.length} links`,
      status: "complete",
    });
    const pageUrls = selectAuditPages(
      options.url,
      links,
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
            summary = report.summary;
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
            url: options.url,
            viewport: null,
            description: `Link returned HTTP ${linkResponse.status}`,
            evidence: [
              {
                type: "network",
                detail: `GET ${link}: ${linkResponse.status}`,
              },
            ],
            reproductionSteps: [`Open ${options.url}`, `Follow ${link}`],
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
      if (!ai) {
        mission = {
          outcome: "FAILED",
          summary: "Gemini is required for autonomous mission planning.",
          evidence: [],
        };
      } else {
        await browser.navigateTo(options.url);
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
    }
    let normalized = deduplicate(findings);
    if (ai && options.repository) {
      await event({
        agent: "code",
        message: "Retrieving likely source files from GitHub",
        status: "running",
      });
      try {
        const repo = await investigateRepository(
          ai,
          options.repository,
          normalized,
          options.userId,
        );
        const fixes = await ai.generateStructured(
          `Investigate evidence-supported causes and propose unified diff patches. Do not pretend changes have been applied. ONLY reference retrieved files, and use exact source context. Return findings enriched with sourceFiles and optional patch, preserving evidence. Findings: ${JSON.stringify(normalized.slice(0, 8))}. Read-only source evidence: ${JSON.stringify(repo)}`,
          reportSchema,
        );
        // Accept source references only when the file was actually retrieved.
        const retrievedPaths = new Set(repo.files.map((file) => file.path));
        for (const fix of fixes.issues) {
          const original = normalized.find(
            (f) => f.title === fix.title && f.url === fix.url,
          );
          if (original) {
            original.sourceFiles = fix.sourceFiles.filter((f) =>
              retrievedPaths.has(f.path),
            );
            if (original.sourceFiles.length) original.patch = fix.patch;
          }
        }
        await event({
          agent: "code",
          message: "Source investigation and suggested patches complete",
          status: "complete",
        });
      } catch (e) {
        warnings.push((e as Error).message);
      }
    }
    normalized = deduplicate(normalized);
    await event({
      agent: "report",
      message: `Normalized ${normalized.length} evidence-backed findings`,
      status: "complete",
    });
    return {
      issues: normalized,
      score: score(normalized),
      summary:
        summary ||
        "Deterministic scan complete. Inspect evidence and coverage for each finding.",
      coverage,
      warnings,
      mission,
      checks: {
        lighthouse: "Not run; browser navigation timing measured instead",
        visual: ai
          ? "Gemini screenshot analysis attempted"
          : "Unavailable: configure Gemini",
        externalLinks: "Not checked; same-origin only",
      },
    };
  } finally {
    await stopPreview?.();
    await browser.close();
  }
}

// Keep the homepage plus a small, same-origin sample of safe-looking links.
function selectAuditPages(
  homepageUrl: string,
  links: string[],
  origin: string,
  mode: EngineOptions["mode"],
) {
  const additionalPageLimit = mode === "full" ? 4 : mode === "quick" ? 1 : 0;
  return [
    homepageUrl,
    ...links
      .filter(
        (link) =>
          new URL(link).origin === origin &&
          link !== homepageUrl &&
          !/logout|delete|signout|download/i.test(link),
      )
      .slice(0, additionalPageLimit),
  ];
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
