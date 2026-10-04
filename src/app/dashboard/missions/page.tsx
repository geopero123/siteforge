import { pageSession } from "@/lib/supabase/server";
import { AuditForm } from "@/components/audit-form";
export default async function Missions() {
  const session = await pageSession();
  if (!session) return null;
  const { db } = session;
  const { data, error } = await db.from("projects").select("id,name,url");
  if (error) throw new Error(error.message);
  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">GOAL-BASED BROWSER TESTING</div>
          <h1>Give the browser a mission.</h1>
          <p>
            Every action runs through a real tool and appears in the audit
            timeline.
          </p>
        </div>
      </div>
      <section className="panel">
        <AuditForm projects={data ?? []} missionMode />
      </section>
    </>
  );
}
