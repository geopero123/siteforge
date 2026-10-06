import { FileDiff, KeyRound, MonitorSmartphone, Sparkles } from "lucide-react";
import { pageSession } from "@/lib/supabase/server";
import { AuditForm } from "@/components/audit-form";

const stages = [
  {
    icon: MonitorSmartphone,
    title: "Browser checks",
    text: "Chromium opens your site at three viewport sizes. axe, security headers, network and DOM checks collect objective evidence.",
  },
  {
    icon: KeyRound,
    title: "Repository scan",
    text: "The repository is downloaded read-only and checked for leaked secrets, vulnerable dependencies, risky code, CI and container problems.",
  },
  {
    icon: Sparkles,
    title: "Verified AI review",
    text: "Gemini reviews screenshots and source. Any claim that can’t quote real code or evidence is discarded.",
  },
  {
    icon: FileDiff,
    title: "Fixes you can apply",
    text: "Every finding links to its page or file and line, with a suggested fix and, where possible, a downloadable patch.",
  },
];

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
          <h1>New audit</h1>
          <p>
            Give SiteForge a URL, a GitHub repository, or both. Get every
            problem with a fix.
          </p>
        </div>
      </div>
      <div className="split">
        <section className="panel">
          <AuditForm
            projects={data ?? []}
            initialUrl={url}
            initialRepository={repository}
          />
        </section>
        <aside className="panel">
          <h2>What happens next</h2>
          <div className="activity" style={{ marginTop: 18 }}>
            {stages.map(({ icon: Icon, title, text }) => (
              <div className="activity-entry" key={title}>
                <span className="activity-icon">
                  <Icon size={12} />
                </span>
                <div>
                  <strong style={{ textTransform: "none", fontSize: 13 }}>
                    {title}
                  </strong>
                  <p>{text}</p>
                </div>
              </div>
            ))}
          </div>
          <small>
            Reports clearly label any check that failed or was unavailable.
          </small>
        </aside>
      </div>
    </>
  );
}
