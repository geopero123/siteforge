import Link from "next/link";
import { notFound } from "next/navigation";
import { pageSession } from "@/lib/supabase/server";
import { RepositoryForm } from "@/components/repository-form";
export default async function Project({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await pageSession();
  if (!session) return null;
  const { db } = session;
  const { data: p, error } = await db
    .from("projects")
    .select("*")
    .eq("id", id)
    .single();
  if (error || !p) notFound();
  const { data: audits, error: auditError } = await db
    .from("audits")
    .select("*")
    .eq("project_id", id)
    .order("created_at", { ascending: false });
  if (auditError) throw new Error(auditError.message);
  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">PROJECT</div>
          <h1>{p.name}</h1>
          <p className="mono">
            {[p.url, p.repository].filter(Boolean).join(" · ")}
          </p>
        </div>
        <Link
          className="button primary"
          href={
            "/dashboard/new?" +
            new URLSearchParams({
              ...(p.url ? { url: p.url } : {}),
              ...(p.repository ? { repository: p.repository } : {}),
            })
          }
        >
          New audit →
        </Link>
      </div>
      <div className="grid-2">
        <section className="panel">
          <h2>Audit history</h2>
          {audits?.map((a) => (
            <Link
              className="issue-row"
              key={a.id}
              href={"/dashboard/audits/" + a.id}
            >
              <span className={"badge " + a.status}>{a.status}</span>
              <span className="issue-copy">
                <strong>
                  {a.mode === "repository" ? "code" : a.mode} audit
                  {a.mode !== "repository" && a.repository ? " + code" : ""}
                </strong>
                <small>{new Date(a.created_at).toLocaleString()}</small>
              </span>
              <span className="mono">{a.report?.score?.overall ?? "—"}</span>
            </Link>
          ))}
          {!audits?.length && <p>This project has no audits yet.</p>}
        </section>
        <section className="panel">
          <h2>GitHub repository</h2>
          <RepositoryForm id={id} initial={p.repository} />
        </section>
      </div>
    </>
  );
}
