import { pageSession } from "@/lib/supabase/server";
import { AuditForm } from "@/components/audit-form";
export default async function NewAudit({
  searchParams,
}: {
  searchParams: Promise<{ url?: string }>;
}) {
  const session = await pageSession();
  if (!session) return null;
  const { db } = session;
  const { data, error } = await db
    .from("projects")
    .select("id,name,url")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  const { url } = await searchParams;
  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">BROWSER → EVIDENCE → FINDINGS</div>
          <h1>Put your website to the test.</h1>
          <p>Give SiteForge a URL. Get a report you can reproduce.</p>
        </div>
      </div>
      <div className="grid-2">
        <section className="panel">
          <AuditForm projects={data ?? []} initialUrl={url} />
        </section>
        <aside className="panel" style={{ alignSelf: "start" }}>
          <h2>What happens next</h2>
          <div className="stack">
            <p>
              01 &nbsp; A worker opens your site in Chromium and captures each
              viewport.
            </p>
            <p>
              02 &nbsp; axe, network checks, and DOM measurements collect
              objective evidence.
            </p>
            <p>
              03 &nbsp; Gemini reviews actual screenshots and evidence for
              additional issues.
            </p>
            <p>
              04 &nbsp; Findings and private screenshots are saved to your
              workspace.
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
