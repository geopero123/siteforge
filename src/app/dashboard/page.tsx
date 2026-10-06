import Link from "next/link";
import {
  Activity,
  ArrowRight,
  Folder,
  Gauge,
  Globe,
  Plus,
  ScanLine,
} from "lucide-react";
import { pageSession } from "@/lib/supabase/server";
import {
  CountUp,
  GithubMark,
  StatusBadge,
  displayTarget,
  modeLabel,
  relativeTime,
  scoreTone,
} from "@/components/ui";
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
  const latest = rows.find((a) => typeof a.report?.score?.overall === "number");
  const stats = [
    { label: "Projects", value: projects.data?.length ?? 0, icon: Folder },
    { label: "Recent audits", value: rows.length, icon: ScanLine },
    {
      label: "In progress",
      value: rows.filter((a) => ["queued", "running"].includes(a.status))
        .length,
      icon: Activity,
    },
    {
      label: "Latest score",
      value: latest ? latest.report.score.overall : "—",
      icon: Gauge,
      tone: latest ? scoreTone(latest.report.score.overall) : undefined,
    },
  ];
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Overview</h1>
          <p>
            Every audit starts with your site or code and ends with evidence.
          </p>
        </div>
        <Link className="button primary" href="/dashboard/new">
          <Plus size={16} />
          New audit
        </Link>
      </div>
      <div className="grid-4">
        {stats.map(({ label, value, icon: Icon, tone }) => (
          <div className="panel stat-card" key={label}>
            <header>
              <span className="stat-label">{label}</span>
              <Icon size={16} />
            </header>
            <div
              className={"stat " + (tone ?? "")}
              style={tone ? { color: "var(--tone)" } : undefined}
            >
              {typeof value === "number" ? <CountUp value={value} /> : value}
            </div>
          </div>
        ))}
      </div>
      <div className="section-title">
        <h2>Recent audits</h2>
        <Link href="/dashboard/projects">
          All projects <ArrowRight size={14} />
        </Link>
      </div>
      {!rows.length ? (
        <div className="empty">
          <ScanLine size={30} />
          <h2>Your first finding starts here.</h2>
          <p>Create a project and scan its website or GitHub repository.</p>
          <Link href="/dashboard/new" className="button primary">
            Start an audit
          </Link>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Target</th>
                <th className="hide-sm">Type</th>
                <th>Status</th>
                <th>Score</th>
                <th className="hide-sm">Started</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a, index) => (
                <tr
                  key={a.id}
                  style={{ ["--i" as string]: Math.min(index, 12) }}
                >
                  <td className="target-cell">
                    <div className="target">
                      {a.url ? <Globe size={16} /> : <GithubMark size={15} />}
                      <Link href={"/dashboard/audits/" + a.id}>
                        {displayTarget(a)}
                      </Link>
                    </div>
                  </td>
                  <td className="hide-sm muted">
                    {modeLabel(a.mode, !!a.repository)}
                  </td>
                  <td>
                    <StatusBadge status={a.status} />
                  </td>
                  <td>
                    {typeof a.report?.score?.overall === "number" ? (
                      <span
                        className={
                          "score-pill " + scoreTone(a.report.score.overall)
                        }
                      >
                        {a.report.score.overall}
                      </span>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td className="hide-sm muted" title={a.created_at}>
                    {relativeTime(a.created_at)}
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
