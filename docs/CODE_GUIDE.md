# Reading the SiteForge code

SiteForge has two running processes: the Next.js web app and an audit worker. The web app creates audit jobs and displays saved results. The worker takes jobs from the database, runs browser checks, and saves the evidence and report.

## Follow an audit

1. `src/components/audit-form.tsx` collects the audit settings.
2. `src/app/api/audits/route.ts` validates the request and queues the job.
3. `scripts/worker.ts` claims a queued job and supplies storage callbacks to the audit engine. Its heartbeat tells the database that the job is still running.
4. `src/lib/audit/engine.ts` chooses pages, scans each viewport, gathers findings, optionally runs a mission or investigates source code, and builds the final report.
5. The worker saves the findings and updates the audit status. The audit view reads the saved evidence to display progress and results.

## The main modules

| File | Responsibility |
| --- | --- |
| `src/lib/browser/session.ts` | Owns Chromium and exposes browser actions, screenshots, DOM measurements, and accessibility checks. |
| `src/lib/audit/deterministic.ts` | Converts measured browser evidence into findings without AI. |
| `src/lib/audit/schema.ts` | Defines valid report data, merges duplicate findings, and calculates scores. |
| `src/lib/ai/provider.ts` | Sends requests to Gemini and validates structured responses. |
| `src/lib/ai/mission.ts` | Runs the model/tool conversation and checks completion against recorded tool results. |
| `src/lib/github/repository.ts` | Retrieves a bounded set of source files for investigation. |
| `src/lib/security/url.ts` | Validates destinations and limits mission actions. |

## How the engine talks to storage

`runAudit` receives callbacks rather than opening its own database connection. `event` saves progress, `screenshot` stores an evidence image and returns its reference, `page` saves measured page data, and `step` saves a mission action. The optional `preview` callback saves live browser frames. The worker implements these callbacks; browser tests supply local alternatives.

## Terms used in the code

- **Finding:** an issue with evidence, severity, confidence, and a suggested fix.
- **Viewport:** the browser dimensions used for desktop, tablet, or mobile checks.
- **Coverage:** the pages and viewports that were scanned.
- **Mission:** a user objective pursued through bounded browser tools.
- **Partial report:** an audit completed with warnings or an incomplete mission.

Visual findings remain hypotheses, with confidence capped at 0.85. Mission evidence must quote a successful recorded tool result. Repository investigation suggests patches but does not apply them. Scores merge duplicate findings first and count only open issues.

For local setup and verification commands, see the [README](../README.md). For deployment details, see [HOSTING.md](HOSTING.md).
