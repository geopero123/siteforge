import { Footprints, ShieldBan, Target } from "lucide-react";
import { pageSession } from "@/lib/supabase/server";
import { AuditForm } from "@/components/audit-form";
export default async function Missions() {
  const session = await pageSession();
  if (!session) return null;
  const { db } = session;
  const { data, error } = await db
    .from("projects")
    .select("id,name,url,repository")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Missions</h1>
          <p>
            Describe a user goal. The browser attempts it step by step, and
            every action appears in the audit timeline.
          </p>
        </div>
      </div>
      <div className="split">
        <section className="panel">
          <AuditForm projects={data ?? []} missionMode />
        </section>
        <aside className="panel">
          <h2>
            <Target size={16} /> Good missions are specific
          </h2>
          <div className="kv" style={{ marginTop: 16 }}>
            <div>
              <span>
                <Footprints size={15} /> “Open the mobile menu and reach the
                pricing page”
              </span>
            </div>
            <div>
              <span>
                <Footprints size={15} /> “Find the contact form and check that
                every field has a label”
              </span>
            </div>
            <div>
              <span>
                <ShieldBan size={15} /> Purchases, deletions and form
                submissions stay blocked unless you explicitly allow
                submissions.
              </span>
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}
