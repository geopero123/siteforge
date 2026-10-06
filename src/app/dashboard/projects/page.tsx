import Link from "next/link";
import { ArrowUpRight, FolderPlus, Globe } from "lucide-react";
import { pageSession } from "@/lib/supabase/server";
import { ProjectForm } from "@/components/project-form";
import { GithubMark, relativeTime } from "@/components/ui";
export default async function Projects() {
  const session = await pageSession();
  if (!session) return null;
  const { db } = session;
  const { data, error } = await db
    .from("projects")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Projects</h1>
          <p>One audit history for each website, repository, or both.</p>
        </div>
      </div>
      <div className="split">
        <div className="stack">
          {data?.map((p, index) => (
            <Link
              className="panel project-card"
              key={p.id}
              style={{ ["--i" as string]: Math.min(index, 12) }}
              href={"/dashboard/projects/" + p.id}
            >
              <header>
                <div>
                  <h2>{p.name}</h2>
                  <small>Created {relativeTime(p.created_at)}</small>
                </div>
                <ArrowUpRight size={18} />
              </header>
              <div className="chips">
                {p.url && (
                  <span className="chip">
                    <Globe size={13} />
                    {p.url.replace(/^https?:\/\//, "")}
                  </span>
                )}
                {p.repository && (
                  <span className="chip">
                    <GithubMark size={12} />
                    {p.repository}
                  </span>
                )}
              </div>
            </Link>
          ))}
          {!data?.length && (
            <div className="empty">
              <FolderPlus size={28} />
              <h2>No projects yet</h2>
              <p>Create one for a website, a GitHub repository, or both.</p>
            </div>
          )}
        </div>
        <section className="panel">
          <h2>New project</h2>
          <p className="panel-sub">
            Add a website, a repository, or both. You can attach a repository
            later.
          </p>
          <ProjectForm />
        </section>
      </div>
    </>
  );
}
