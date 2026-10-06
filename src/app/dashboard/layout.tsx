import { supabasePublicKey } from "@/lib/supabase/config";
import { pageSession } from "@/lib/supabase/server";
import { Sidebar, WorkspaceHeader } from "@/components/sidebar";
import { Brand } from "@/components/brand";
import Link from "next/link";
export const dynamic = "force-dynamic";
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !supabasePublicKey())
    return (
      <main className="panel setup-card">
        <Brand />
        <h1 style={{ marginTop: 28 }}>Connect your workspace</h1>
        <p>
          Add the Supabase URL and public key to <code>.env.local</code>, apply
          the included migrations, then restart the app.
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
        <WorkspaceHeader />
        <main className="main">{children}</main>
      </div>
    </div>
  );
}
