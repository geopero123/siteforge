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

The included `Dockerfile.worker` runs the persistent queue consumer with Chromium. Provision its required Supabase URL, service-role key, Gemini key and model settings through the worker host's secret environment configuration. Follow README's production network isolation and Chromium sandbox requirements before enabling public audits. Set `NODE_ENV=production`, leave `ALLOW_LOCAL_AUDITS` disabled, and set `AUDIT_EGRESS_ISOLATED=true` only after implementing and verifying actual egress restrictions.

## Verification

After deployment: check the landing page and login, sign in through the custom domain, load the workspace, queue an authorized audit, confirm the hosted worker claims it, watch the browser preview and inspect the saved private evidence. A successful web build alone does not verify the worker or authentication flow.
