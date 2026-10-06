import {
  CircleCheck,
  CircleDashed,
  Gauge,
  Server,
  UserRound,
} from "lucide-react";
import { supabasePublicKey } from "@/lib/supabase/config";
import { pageSession } from "@/lib/supabase/server";
import { severities } from "@/lib/audit/schema";
export default async function Settings() {
  const session = await pageSession();
  if (!session) return null;
  const { user } = session;
  const setup: Array<[string, boolean]> = [
    [
      "Supabase",
      !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!supabasePublicKey(),
    ],
    ["Gemini (web environment)", !!process.env.GEMINI_API_KEY],
    [
      "Worker service role (web environment)",
      !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    ],
    ["Private GitHub access (optional)", !!process.env.GITHUB_TOKEN],
  ];
  const weights = { critical: 30, high: 15, medium: 7, low: 2, info: 0 };
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Settings</h1>
          <p>Your account, deployment configuration and how scores work.</p>
        </div>
      </div>
      <div className="grid-2">
        <div className="stack">
          <section className="panel">
            <h2>
              <UserRound size={16} /> Account
            </h2>
            <div className="sidebar-bottom" style={{ border: 0, padding: 0 }}>
              <span className="avatar" aria-hidden>
                {(user.email ?? "?").slice(0, 2)}
              </span>
              <div className="sidebar-user" style={{ display: "block" }}>
                <strong>{user.email}</strong>
                <span>Managed by Supabase Auth</span>
              </div>
            </div>
            <p style={{ margin: "16px 0 0", fontSize: 13 }}>
              GitHub repository access is separate from GitHub sign-in.
            </p>
          </section>
          <section className="panel">
            <h2>
              <Server size={16} /> Configuration
            </h2>
            <div className="kv">
              {setup.map(([name, ready]) => (
                <div key={name}>
                  <span>
                    {ready ? (
                      <CircleCheck size={15} color="var(--accent)" />
                    ) : (
                      <CircleDashed size={15} color="var(--faint)" />
                    )}
                    {name}
                  </span>
                  <span className={"badge " + (ready ? "complete" : "queued")}>
                    {ready ? "Configured" : "Not set"}
                  </span>
                </div>
              ))}
            </div>
            <p style={{ margin: "14px 0 0", fontSize: 13 }}>
              The worker may use a separate environment. Check its logs to
              confirm it is running.
            </p>
          </section>
        </div>
        <section className="panel">
          <h2>
            <Gauge size={16} /> How scoring works
          </h2>
          <p>
            Each category starts at 100. Every open finding subtracts its
            severity weight multiplied by its confidence.
          </p>
          <div className="kv">
            {severities.map((s) => (
              <div key={s}>
                <span className={"badge " + s}>{s}</span>
                <span className="mono">−{weights[s]} × confidence</span>
              </div>
            ))}
          </div>
          <p style={{ margin: "16px 0 0", fontSize: 13 }}>
            The overall score averages the categories the audit could observe:
            seven for websites, four for repositories, and all nine when both
            are scanned. Resolved and ignored findings stop counting. A high
            score with limited coverage does not establish that a site or
            codebase is bug-free.
          </p>
        </section>
      </div>
    </>
  );
}
