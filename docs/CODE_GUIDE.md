# Reading the SiteForge code

SiteForge has two running processes: the Next.js web app and an audit worker. The web app creates audit jobs and displays saved results. The worker takes jobs from the database, runs browser checks and repository scans, and saves the evidence and report.

## Follow an audit

1. `src/components/audit-form.tsx` collects the audit settings.
2. `src/app/api/audits/route.ts` validates the request and queues the job.
3. `scripts/worker.ts` claims a queued job and supplies storage callbacks to the audit engine. Its heartbeat tells the database that the job is still running.
4. `src/lib/audit/engine.ts` runs up to two stages. The website stage chooses pages, scans each viewport, and optionally runs a mission. The repository stage (`src/lib/repository/scan.ts`) scans the code and links website findings to source files. The engine then builds the final report, scored over the categories the stages could observe.
5. The worker saves the findings and updates the audit status. The audit view reads the saved evidence to display progress and results.

## The main modules

| File | Responsibility |
| --- | --- |
| `src/lib/browser/session.ts` | Owns Chromium and exposes browser actions, screenshots, DOM measurements, and accessibility checks. |
| `src/lib/audit/deterministic.ts` | Converts measured browser evidence into findings without AI. |
| `src/lib/audit/schema.ts` | Defines valid report data, merges duplicate findings, and calculates scores. |
| `src/lib/ai/provider.ts` | Sends requests to Gemini and validates structured responses. |
| `src/lib/ai/mission.ts` | Runs the model/tool conversation and checks completion against recorded tool results. |
| `src/lib/repository/reference.ts` | Parses `owner/repo`, `owner/repo#branch` and GitHub links. |
| `src/lib/repository/github.ts` | Downloads one bounded archive of a commit and indexes its files (`tar.ts` reads it). |
| `src/lib/repository/rules.ts` | Static checks for secrets, dangerous code patterns, and CI, container and project configuration. |
| `src/lib/repository/dependencies.ts` | Parses lockfiles and looks up known vulnerabilities on OSV.dev. |
| `src/lib/repository/review.ts` | Batched AI code review; drops claims that do not quote real code and patches that do not apply. |
| `src/lib/repository/findings.ts` | Converts located source problems into findings that link to GitHub. |
| `src/lib/github/repository.ts` | Picks the source files most likely behind website findings. |
| `src/lib/security/url.ts` | Validates destinations and limits mission actions. |

## How the engine talks to storage

`runAudit` receives callbacks rather than opening its own database connection. `event` saves progress, `screenshot` stores an evidence image and returns its reference, `page` saves measured page data, and `step` saves a mission action. The optional `preview` callback saves live browser frames. The worker implements these callbacks; browser tests supply local alternatives.

## Terms used in the code

- **Finding:** an issue with evidence, severity, confidence, and a suggested fix.
- **Viewport:** the browser dimensions used for desktop, tablet, or mobile checks.
- **Coverage:** the pages, viewports and repository files that were scanned.
- **Scope:** the score categories an audit can observe; stored as the keys of `report.score.categories`.
- **Mission:** a user objective pursued through bounded browser tools.
- **Partial report:** an audit completed with warnings or an incomplete mission.

Visual findings remain hypotheses, with confidence capped at 0.85. Mission evidence must quote a successful recorded tool result. AI code-review findings must quote the file they cite, and their confidence is capped at 0.8. Repository scans suggest patches but never apply them. Scores merge duplicate findings first and count only open issues.

For local setup and verification commands, see the [README](../README.md). For deployment details, see [HOSTING.md](HOSTING.md).
