# siteforge.madebygio.dev

Deploy the Next.js web app as a separate Vercel project named `siteforge` in the existing Vercel team. The standalone audit worker is a separate service; deploying the web app alone does not process queued audits.

Web deployment on 2026-10-04: READY in `geopero123s-projects/siteforge`, deployment `dpl_5P5YVwzVNzts1pNg48mDN3KMHCJi`. Inspector: https://vercel.com/geopero123s-projects/siteforge/5P5YVwzVNzts1pNg48mDN3KMHCJi. Default Vercel deployment URLs require Vercel login; the project's protection excludes custom domains. User saved Porkbun DNS and Supabase Auth URL settings. Verified public DNS resolves to `76.76.21.21`; issued an auto-renewing Vercel certificate for the subdomain. Custom-domain HTTPS home and login return HTTP 200, and the audit API rejects unauthenticated requests with HTTP 401. Chromium loads the site successfully. Signed-in authentication and the hosted audit worker remain unverified.

## Web environment

Copy these values from the local configuration into Vercel's encrypted production environment variables:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_APP_URL=https://siteforge.madebygio.dev`

The web app uses user sessions and RLS. Keep `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY` and any GitHub token on the worker host. `.vercelignore` excludes local environment files from deployment uploads.

## Domain and authentication

The new Vercel project is linked locally and has `siteforge.madebygio.dev` attached. DNS is hosted by Porkbun. On 2026-10-04, `vercel domains inspect` recommended an `A` record with host `siteforge` and answer `76.76.21.21`; TTL can remain at its default. Add that record in Porkbun's DNS management for `madebygio.dev`. Verify DNS and HTTPS once the record propagates. Recheck Vercel's domain configuration if its recommendation changes.

In Supabase Auth URL Configuration, set the Site URL to `https://siteforge.madebygio.dev` and add `https://siteforge.madebygio.dev/auth/callback` to Redirect URLs. Preserve the localhost callback if continuing local development.

## Audit worker

The included `Dockerfile.worker` runs the persistent queue consumer with Chromium. Provision its required Supabase URL, service-role key, Gemini key and model settings through the worker host's secret environment configuration. Follow README's production network isolation and Chromium sandbox requirements before enabling public audits. Set `NODE_ENV=production`, leave `ALLOW_LOCAL_AUDITS` disabled, and set `AUDIT_EGRESS_ISOLATED=true` only after implementing and verifying actual egress restrictions. Repository scans also need outbound HTTPS to `api.github.com`, `codeload.github.com` and `api.osv.dev`, and should have `GITHUB_PUBLIC_TOKEN` set (see `.env.example`). Before deploying commit 094c173 or later, follow [Upgrading to repository scans](#upgrading-to-repository-scans).

## Upgrading to repository scans

Commits from 094c173 onward need `supabase/migrations/20261006090000_repository_audits.sql`, and later commits also `20261006120000_audit_rate_limits.sql` (per-account limits on queued and hourly audits). Apply them in that order. Until the first is applied, the new web app cannot create audits or code-only projects. Both are forward-only.

1. **Workers first.** If any worker processes the production queue, wait until `select id from public.audits where status = 'running';` returns no rows, stop it, and start one built from current `main`. The new worker works with both the old and new schema. An older worker fails every code-only audit with "Invalid URL".
2. **Apply the migration.** Check the history in the Supabase SQL editor: `select version from supabase_migrations.schema_migrations order by version;`
   - If it lists 20261004084108 and 20261004162058, link the CLI (`npx supabase link --project-ref <ref>`), confirm that `npx supabase db push --dry-run` lists only the two new files, then run `npx supabase db push`.
   - Otherwise, paste each file into the SQL editor and run it once, in order. The initial migration went through the Supabase connector, and nothing records how the billing migration was applied, so the CLI may try to rerun them. If you switch to the CLI later, record them with `npx supabase migration repair --status applied 20261006090000 20261006120000`.
   - If it stops on a lock timeout or deadlock, nothing changed; run it again.
3. **Reload the API schema:** `notify pgrst, 'reload schema';`
4. **Verify.** `select column_name from information_schema.columns where table_schema = 'public' and table_name = 'audits' and column_name = 'repository';` returns one row. Then start one website audit and one code-only audit.
5. **Deploy the web app** from `main` with `vercel --prod`. Production was deployed with the Vercel CLI, so pushing to GitHub does not update it unless Git integration has been connected since.

Don't roll the web app back to a build older than 094c173 once code-only audits exist: their pages need the newer code, and the schema change cannot be undone without deleting those audits.

## Verification

After deployment: check the landing page and login, sign in through the custom domain, load the workspace, queue an authorized audit, confirm the hosted worker claims it, watch the browser preview and inspect the saved private evidence. A successful web build alone does not verify the worker or authentication flow.
