# SiteForge

Website and code QA. Give SiteForge a website URL, a GitHub repository, or both: it audits the live site in real Chromium (axe accessibility, security headers, layout/SEO/runtime evidence, Gemini screenshot analysis), reads the whole repository (leaked secrets, vulnerable dependencies, risky code, CI and container configuration, AI code review), and reports every finding with its page or file and line, a suggested fix, and a patch where one can be verified. Next.js serves the workspace; a separate worker performs audits from a durable queue. Production has no sample-findings fallback.

For a walkthrough of the request flow and main modules, see the [code guide](docs/CODE_GUIDE.md).

Pricing is $2 for a single test or $7.99/month for 20 tests. Hosted checkout, a billing portal, signed payment webhooks and database-enforced credits are implemented. Paid access stays off until configured. See [billing setup and verification](docs/BILLING.md) before enabling payments; the billing migration is separate from the initial schema.

## Run locally

Use Node.js 22 or newer.

```sh
npm ci
cp .env.example .env.local
npx playwright install chromium
```

Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and `GEMINI_API_KEY` in `.env.local`. The publishable key is preferred; `NEXT_PUBLIC_SUPABASE_ANON_KEY` remains supported as a legacy fallback. Keep service and AI keys server-side. `GEMINI_MODEL` is configurable.

Apply `supabase/migrations/20261004084108_initial_siteforge.sql` to a fresh Supabase project through its SQL editor or the Supabase CLI migration workflow. This creates projects, audits, issues, collected pages, screenshot records, mission steps, live events, queue functions, ownership policies, and a private screenshot bucket. Auth users are managed by Supabase Auth.

In Supabase Authentication settings, set the Site URL to `http://localhost:3000` and allow `http://localhost:3000/auth/callback`. Email sign-in uses secure links. For GitHub sign-in, enable the GitHub provider and configure its OAuth credentials in Supabase; the application does not need the GitHub OAuth secret.

```sh
npm run dev
```

Run the worker separately. Public or untrusted sites require an isolated worker with real network egress restrictions as described below. For trusted local fixture sites only, set `ALLOW_LOCAL_AUDITS=true` in a non-production environment:

```sh
npm run worker
```

Visit the app, sign in, create a project, and start an audit. Progress is persisted as actual operations finish. If no worker is running, the job stays queued. Reopen any audit to inspect evidence and screenshots.

Running audits show a view-only Browser preview with actual Chromium viewport captures refreshed about every three seconds, the current URL, and recent activity. Frames use the existing private screenshot bucket and audit ownership policies. Each audit overwrites one preview image and updates one metadata row; regular evidence screenshots remain separate. Preview availability depends on the worker and storage connection. Restart an existing worker after updating this code; no additional migration is needed.

## Audit behavior

- Quick: homepage plus at most one linked page; three viewports; up to ten same-origin link checks.
- Full: homepage plus at most four more pages, chosen round-robin across site sections from links and `/sitemap.xml`; three viewports; up to thirty link checks.
- Code only (`repository` mode): no browser; the full repository scan described below.
- Any website mode with a repository attached (on the audit or the project) also runs the full repository scan, and links website findings to likely source files with suggested patches.
- Homepage response checks: HSTS, Content-Security-Policy, X-Content-Type-Options, clickjacking protection, plain HTTP, version disclosure, Set-Cookie flags, and mixed content.
- Mission: baseline homepage audit, then bounded Gemini-planned browser actions at mobile dimensions. Form submission requires the explicit checkbox. Purchases and destructive controls are blocked.
- Viewports: desktop 1440×900, tablet 768×1024, mobile 390×844.
- Screenshots are actual viewport captures and private signed URLs. Browser console errors, failed requests, axe violations, metadata, navigation timing, overflow, and clipping are measured.
- AI visual findings are hypotheses with confidence capped at 0.85. Mission success requires exact observations cited from successful tool steps. Whether those observations establish the natural-language goal remains a model judgment; review its steps.
- Missing AI configuration or failed checks produce warnings and a partial report. An incomplete report's score is labeled accordingly. A 404 page does not count as audited coverage.
- Browser API actions are step/navigation/time bounded. Audits have five-minute deadlines, fifteen minutes in Full mode, and ten minutes for code-only scans; website audits that also scan a repository get five extra minutes. Worker shutdown cancels the active browser. Expired leases fail instead of replaying missions.
- Each audit makes at most `AI_MAX_CALLS_PER_AUDIT` model calls (default 60). Once that limit is hit, the remaining AI checks are skipped and the report shows a warning.

Scores start at 100 in each category the audit can observe: performance, accessibility, SEO, UX, reliability, responsive and security for websites; security, reliability, code and dependencies for repositories; all of them for combined audits. Deduct critical=30, high=15, medium=7, low=2, info=0 multiplied by confidence; round and clamp each category, then average them. Deduplicate before scoring. Resolved and ignored issues are excluded from the current score; the original score remains saved. This is an issue-based risk index, not a Lighthouse score or proof of complete coverage.

## Repository scanning

Enter `owner/repo`, `owner/repo#branch`, or a `https://github.com/owner/repo` link (a `/tree/<branch>` link selects that branch) on the new-audit form or in Project Detail. Public repositories work without a token. For a private repository, configure a fine-grained read-only `GITHUB_TOKEN`, comma-separated `GITHUB_REPOSITORIES`, and `GITHUB_TOKEN_USER_ID` set to the authorized user's Supabase UUID. The token is never used for another user or an unlisted repository. GitHub OAuth login does not grant repository access.

The worker downloads one archive of the pinned commit (at most 60 MB compressed and 250 MB extracted; files over 400 KB are indexed but not read), then runs:

1. **Secrets:** private keys, cloud, GitHub, Stripe, Slack, and AI provider tokens, plus hard-coded credentials. Values are masked in the report. Hits in tests and fixtures are reported as low severity, and placeholder or low-entropy values are ignored.
2. **Code patterns:** SQL and command injection, eval, unsafe HTML, unsafe deserialization, disabled TLS verification, unverified JWTs, weak hashes, wildcard CORS, debug mode, and server secrets exposed through `NEXT_PUBLIC_`/`VITE_` variables.
3. **Configuration:** committed `.env` files or `node_modules`, missing lockfiles, unbounded versions, `curl | sh` scripts, TypeScript strict mode, Dockerfiles that run as root, use unpinned images, or bake in secrets, GitHub Actions `pull_request_target` checkouts, script injection, missing permissions and unpinned third-party actions, and missing CI, tests, README, or `.gitignore`.
4. **Dependencies:** locked versions from npm, Yarn, pnpm, pip, Poetry, uv, Pipfile, Cargo, Go, Bundler, and Composer are checked against [OSV.dev](https://osv.dev). Each finding names the advisories and an upgrade command. Development-only packages are lowered one severity step.
5. **AI code review:** source files are reviewed in batches, riskiest paths first (auth, payments, API routes, database). `REPO_REVIEW_MAX_BATCHES` (default 8, about 40,000 characters each) bounds cost. Every AI finding must quote real code from the file it names, or it is discarded. A suggested patch is kept only if every line it removes exists in that file. Confidence is capped at 0.8.

Findings link to the file and line on GitHub at the scanned commit. Patches can be downloaded; no repository is ever modified. The worker needs outbound HTTPS to `api.github.com`, `codeload.github.com`, and `api.osv.dev` in addition to Gemini. A hosted multi-user installation should replace the single-account token configuration with per-user GitHub App installations before offering private connections to additional accounts.

## Deployment

The web app can run on a Next.js host or in the included `Dockerfile`. It uses standalone output. Build-time public Supabase variables must match the deployment:

```sh
docker build -t siteforge-web \
  --build-arg NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co \
  --build-arg NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLIC_KEY .
docker run --rm -p 3000:3000 siteforge-web
```

Build the separate worker with `Dockerfile.worker`. Its Playwright image matches the package version. Configure worker secrets through your hosting platform. The web process does not need the Gemini key, service-role key, or GitHub token when the worker is hosted separately.

**Worker network isolation is a deployment prerequisite.** A Docker image and `AUDIT_EGRESS_ISOLATED=true` do not create a firewall. Use a dedicated disposable worker environment whose egress policy blocks loopback, private, link-local, metadata, multicast, reserved, and internal destinations for both IPv4 and IPv6, including after DNS resolution. Application URL/DNS checks alone cannot prevent DNS rebinding. Do not run the worker on a network containing sensitive services, with host mounts, a Docker socket, or cloud credentials.

The worker runs as `pwuser`, Chromium sandboxing is enabled outside trusted local mode, and Chromium does not inherit service keys. Use a sandbox-compatible seccomp policy and a platform supporting unprivileged user namespaces; see [Playwright's container guidance](https://playwright.dev/docs/docker). Give the worker CPU/memory/process limits, an init process, and writable temporary space. If the Chromium sandbox cannot start, fix the host/container configuration rather than disabling it for arbitrary sites. Only set `AUDIT_EGRESS_ISOLATED=true` after verifying the actual egress policy.

Container recipes are supplied; image builds and production networking have not been verified in this workspace. Update Supabase auth callback allowlists and Site URL for the deployed origin. No remote deployment is performed by this project setup.

## Verification

```sh
npm run typecheck
npm run lint
npm test
npm run test:browser
npm run test:ui
npm run build
```

`npm run test:ui` starts the app against an in-memory stand-in for Supabase Auth, the REST API and Storage, filled with fixture projects, audits and findings. It loads every page at desktop and mobile widths and fails on console errors or content pushed past the screen edge. It then runs the main flows: sign-in redirects, new audits from a URL or GitHub link, the pending-audit limit, filters and search, resolving and ignoring findings, copying patches, saving repositories, creating projects, billing state, the 404 page and sign-out. Set `UI_SCREENSHOTS=<folder>` to save screenshots. To browse the same fixture workspace yourself, run `npm run preview:ui` and open the printed sign-in link. Only one `next dev` can run per folder, so stop other dev servers first. The stand-in does not enforce database policies or triggers; those are covered by the database tests.

The browser integration uses a deliberately broken local HTTP fixture and an injected AI test boundary. It checks real Chromium interaction, changing preview frames and cleanup, three evidence screenshots, axe findings, console/network evidence, SEO/layout issues, scoring, failed-page coverage, cancellation, and deadlines. It does not verify live Gemini responses or Supabase authentication.

Database assertions are in `scripts/database-smoke.sql`; `database-bootstrap.sql` supplies minimal Auth/Storage stand-ins only for a fresh disposable PostgreSQL database. Apply the bootstrap, migration, and smoke assertions in that order using `psql -v ON_ERROR_STOP=1`. Never run the bootstrap against a Supabase project. Assertions cover two-user isolation, private storage, issue column grants, anonymous access denial, job claims, and lease expiry. This SQL check does not emulate the Supabase Auth or Storage HTTP services.

The build uses Webpack because Turbopack process sockets were unavailable in the verification environment. No TypeScript checks are disabled. The live milestone still needs configured credentials: sign in → create project → queue audit → worker browser/AI → persist evidence → inspect the saved report.

Known limits: no Lighthouse run, external-link crawling, authenticated target sessions, CAPTCHA solving, automated PRs, or scheduled scans. Repository scanning supports GitHub only and does not run the project's code, build, or tests. Redirects to another origin are blocked; same-origin link checks report the first response without following redirects. SPA network writes are blocked unless form submissions are authorized, which can limit some read-only GraphQL sites. Visual screenshots can include the audited page's visible data; audit only sites you are authorized to inspect.

The remaining npm advisory is an unpatched development-only `braces` dependency under Next.js's ESLint plugin; five audit entries share this chain. Production dependency audit is tracked separately. No Next.js downgrade or forced major dependency change is used. [Advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm).
