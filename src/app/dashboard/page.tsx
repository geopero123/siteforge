import Link from "next/link";
import { Plus, ScanLine } from "lucide-react";
import { pageSession } from "@/lib/supabase/server";
export default async function Dashboard() {
  const session = await pageSession();
  if (!session) return null;
  const { db } = session;
  const [projects, audits] = await Promise.all([
    db.from("projects").select("*").order("created_at", { ascending: false }),
    db
      .from("audits")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20),
  ]);
  if (projects.error || audits.error)
    throw new Error(
      "Unable to load workspace. Apply the Supabase migration and check database permissions.",
    );
  const rows = audits.data ?? [];
  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">YOUR WORKSPACE</div>
          <h1>Website quality, in focus.</h1>
          <p>Every audit starts with your site and ends with evidence.</p>
        </div>
        <Link className="button primary" href="/dashboard/new">
          <Plus size={16} />
          New audit
        </Link>
      </div>
      <div className="grid-3" style={{ marginBottom: 30 }}>
        {[
          ["Projects", projects.data?.length ?? 0],
          ["Recent audits", rows.length],
          [
            "In progress",
            rows.filter((a) => ["queued", "running"].includes(a.status)).length,
          ],
        ].map(([label, value]) => (
          <div className="panel" key={label}>
            <div className="stat-label">{label}</div>
            <div className="stat">{value}</div>
          </div>
        ))}
      </div>
      <div className="panel-title">
        <h2>Recent audits</h2>
        <span className="mono muted">LATEST 20</span>
      </div>
      {!rows.length ? (
        <div className="empty">
          <ScanLine size={30} />
          <h2>Your first finding starts here.</h2>
          <p>Create a project and scan its website to begin.</p>
          <Link href="/dashboard/new" className="button">
            Start an audit →
          </Link>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Website</th>
                <th>Mode</th>
                <th>Status</th>
                <th>Score</th>
                <th>Started</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id}>
                  <td>
                    <Link href={"/dashboard/audits/" + a.id}>{a.url} ↗</Link>
                  </td>
                  <td>{a.mode}</td>
                  <td>
                    <span className={"badge " + a.status}>{a.status}</span>
                  </td>
                  <td className="mono">{a.report?.score?.overall ?? "—"}</td>
                  <td className="muted">
                    {new Date(a.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
