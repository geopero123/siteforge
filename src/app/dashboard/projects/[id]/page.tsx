import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, Globe, History, Plus, ScanLine } from "lucide-react";
import { pageSession } from "@/lib/supabase/server";
import { RepositoryForm } from "@/components/repository-form";
import {
  GithubMark,
  StatusBadge,
  modeLabel,
  relativeTime,
  scoreTone,
} from "@/components/ui";
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
          <h1>{p.name}</h1>
          <div className="chips">
            {p.url && (
              <a className="chip" href={p.url} target="_blank" rel="noreferrer">
                <Globe size={13} />
                {p.url.replace(/^https?:\/\//, "")}
              </a>
            )}
            {p.repository && (
              <a
                className="chip"
                href={"https://github.com/" + p.repository.split("#")[0]}
                target="_blank"
                rel="noreferrer"
              >
                <GithubMark size={12} />
                {p.repository}
              </a>
            )}
          </div>
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
          <Plus size={16} /> New audit
        </Link>
      </div>
      <div className="split">
        <section className="panel flush">
          <div className="panel-title" style={{ padding: "20px 20px 0" }}>
            <h2>
              <History size={16} /> Audit history
            </h2>
            <small>{audits?.length ?? 0} audits</small>
          </div>
          {audits?.map((a) => (
            <Link
              className="list-row"
              key={a.id}
              href={"/dashboard/audits/" + a.id}
            >
              <StatusBadge status={a.status} />
              <span className="grow">
                <strong>{modeLabel(a.mode, !!a.repository)}</strong>
                <small>{relativeTime(a.created_at)}</small>
              </span>
              {typeof a.report?.score?.overall === "number" && (
                <span
                  className={"score-pill " + scoreTone(a.report.score.overall)}
                >
                  {a.report.score.overall}
                </span>
              )}
              <ChevronRight size={16} />
            </Link>
          ))}
          {!audits?.length && (
            <div className="empty">
              <ScanLine size={26} />
              <p>This project has no audits yet.</p>
            </div>
          )}
        </section>
        <section className="panel">
          <h2>
            <GithubMark size={15} /> GitHub repository
          </h2>
          <p className="panel-sub" style={{ marginTop: 0 }}>
            Attach a repository to scan its code on every audit and link website
            problems to the files that cause them.
          </p>
          <RepositoryForm id={id} initial={p.repository} />
        </section>
      </div>
    </>
  );
}
