import { supabasePublicKey } from "@/lib/supabase/config";
import { pageSession } from "@/lib/supabase/server";
export default async function Settings() {
  const session = await pageSession();
  if (!session) return null;
  const { user } = session;
  const setup = [
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
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Settings</h1>
          <p>Your account and deployment configuration.</p>
        </div>
      </div>
      <div className="grid-2">
        <section className="panel">
          <h2>Account</h2>
          <p>{user.email}</p>
          <small>
            Authentication is managed by Supabase. GitHub repository access is
            separate from GitHub sign-in.
          </small>
        </section>
        <section className="panel">
          <h2>Configuration</h2>
          {setup.map(([name, ready]) => (
            <div key={String(name)} className="agent-row">
              <span>{name}</span>
              <span className={"badge " + (ready ? "complete" : "partial")}>
                {ready ? "configured" : "not set"}
              </span>
            </div>
          ))}
          <p style={{ marginTop: 20 }}>
            The worker may use a separate environment. Check its logs to confirm
            it is running.
          </p>
        </section>
        <section className="panel">
          <h2>Transparent scoring</h2>
          <p>
            Each category starts at 100. Findings subtract severity weights ×
            confidence: critical 30, high 15, medium 7, low 2, info 0.
          </p>
          <small>
            The overall score averages six category scores. A high score with
            limited coverage does not establish that a site is bug-free.
          </small>
        </section>
      </div>
    </>
  );
}
