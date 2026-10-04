import { supabasePublicKey } from "@/lib/supabase/config";
import { pageSession } from "@/lib/supabase/server";
import { Sidebar } from "@/components/sidebar";
import Link from "next/link";
export const dynamic = "force-dynamic";
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !supabasePublicKey())
    return (
      <main className="panel login-card">
        <h1>Connect your workspace</h1>
        <p>
          Add the Supabase URL and public key to <code>.env.local</code>, apply
          the included migration, then restart the app.
        </p>
        <p>
          SiteForge uses real authentication and stored audits. Setup
          instructions are in README.md.
        </p>
        <Link className="button" href="/">
          Back to SiteForge
        </Link>
      </main>
    );
  const session = await pageSession();
  if (!session) return null;
  return (
    <div className="shell">
      <Sidebar email={session.user.email ?? "Signed in"} />
      <div className="workspace">
        <header className="workspace-header">
          <span>Workspace / Website quality</span>
          <span>
            <span className="status-dot" />
            Evidence-driven audits
          </span>
        </header>
        <main className="main">{children}</main>
      </div>
    </div>
  );
}
