import Link from "next/link";
import { pageSession } from "@/lib/supabase/server";
import { ProjectForm } from "@/components/project-form";
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
          <div className="eyebrow">YOUR WEBSITES</div>
          <h1>Projects</h1>
          <p>A dedicated audit history for everything you ship.</p>
        </div>
      </div>
      <div className="grid-2">
        <div className="stack">
          {data?.map((p) => (
            <Link
              className="panel"
              key={p.id}
              href={"/dashboard/projects/" + p.id}
            >
              <h2>{p.name} ↗</h2>
              <p className="mono" style={{ marginBottom: 0, fontSize: 12 }}>
                {p.url}
              </p>
              {p.repository && <small>{p.repository}</small>}
            </Link>
          ))}
          {!data?.length && (
            <div className="empty">No projects yet. Create your first one.</div>
          )}
        </div>
        <section className="panel">
          <h2>Create a project</h2>
          <ProjectForm />
        </section>
      </div>
    </>
  );
}
