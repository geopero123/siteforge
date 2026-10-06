import { pageSession } from "@/lib/supabase/server";
import { AuditForm } from "@/components/audit-form";
export default async function NewAudit({
  searchParams,
}: {
  searchParams: Promise<{ url?: string; repository?: string }>;
}) {
  const session = await pageSession();
  if (!session) return null;
  const { db } = session;
  const { data, error } = await db
    .from("projects")
    .select("id,name,url,repository")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  const { url, repository } = await searchParams;
  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">WEBSITE + CODE → EVIDENCE → FIXES</div>
          <h1>Put your website and code to the test.</h1>
          <p>
            Give SiteForge a URL, a GitHub repository, or both. Get every
            problem with a fix.
          </p>
        </div>
      </div>
      <div className="grid-2">
        <section className="panel">
          <AuditForm
            projects={data ?? []}
            initialUrl={url}
            initialRepository={repository}
          />
        </section>
        <aside className="panel" style={{ alignSelf: "start" }}>
          <h2>What happens next</h2>
          <div className="stack">
            <p>
              01 &nbsp; A worker opens your site in Chromium and captures each
              viewport. axe, security headers, network and DOM checks collect
              objective evidence.
            </p>
            <p>
              02 &nbsp; The repository is downloaded read-only and checked for
              leaked secrets, vulnerable dependencies (OSV.dev), risky code
              patterns, CI and container problems.
            </p>
            <p>
              03 &nbsp; Gemini reviews screenshots and source files. Every AI
              claim must quote real code or evidence, or it is discarded.
            </p>
            <p>
              04 &nbsp; Each finding links to its page or file and line, with a
              suggested fix and, where possible, a patch you can download.
            </p>
          </div>
          <small>
            Run <code>npm run worker</code> alongside the web app. Reports
            clearly label checks that failed or were unavailable.
          </small>
        </aside>
      </div>
    </>
  );
}
