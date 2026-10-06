"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Folder,
  Target,
  Settings,
  LogOut,
  CreditCard,
  Plus,
  ChevronRight,
} from "lucide-react";
import { Brand } from "./brand";
import { browserDb } from "@/lib/supabase/client";

const links = [
  ["/dashboard", "Overview", LayoutDashboard],
  ["/dashboard/projects", "Projects", Folder],
  ["/dashboard/missions", "Missions", Target],
  ["/dashboard/billing", "Tests & billing", CreditCard],
  ["/dashboard/settings", "Settings", Settings],
] as const;

function isActive(path: string, href: string) {
  if (href === "/dashboard")
    return path === href || path.startsWith("/dashboard/audits");
  return path === href || path.startsWith(href + "/");
}

export function Sidebar({ email }: { email: string }) {
  const path = usePathname();
  const router = useRouter();
  return (
    <aside className="sidebar">
      <Brand />
      <Link className="button primary" href="/dashboard/new">
        <Plus size={15} /> New audit
      </Link>
      <div className="nav-label">WORKSPACE</div>
      <nav aria-label="Workspace">
        {links.map(([href, label, Icon]) => (
          <Link
            key={href}
            href={href}
            className={isActive(path, href) ? "active" : ""}
            aria-current={isActive(path, href) ? "page" : undefined}
          >
            <Icon size={16} />
            {label}
          </Link>
        ))}
      </nav>
      <div className="sidebar-bottom">
        <span className="avatar" aria-hidden>
          {email.slice(0, 2)}
        </span>
        <div className="sidebar-user">
          <strong title={email}>{email}</strong>
          <span>Signed in</span>
        </div>
        <button
          className="icon-button"
          aria-label="Sign out"
          title="Sign out"
          onClick={async () => {
            await browserDb().auth.signOut();
            router.push("/");
            router.refresh();
          }}
        >
          <LogOut size={16} />
        </button>
      </div>
    </aside>
  );
}

const crumbLabels: Record<string, string> = {
  projects: "Projects",
  new: "New audit",
  missions: "Missions",
  billing: "Tests & billing",
  settings: "Settings",
  audits: "Audits",
};

export function WorkspaceHeader() {
  const path = usePathname();
  const parts = path.split("/").filter(Boolean).slice(1);
  const crumbs: Array<{ href: string; label: string }> = [
    { href: "/dashboard", label: "Workspace" },
  ];
  parts.forEach((part, index) => {
    const href = "/dashboard/" + parts.slice(0, index + 1).join("/");
    // Audits have no index page; detail pages show a short id instead.
    if (part === "audits") return;
    crumbs.push({
      href,
      label:
        crumbLabels[part] ??
        (parts[index - 1] === "audits" ? "Audit report" : "Project"),
    });
  });
  return (
    <header className="workspace-header">
      <nav className="crumbs" aria-label="Breadcrumb">
        {crumbs.map((crumb, index) => (
          <span key={crumb.href} className="crumbs">
            {index > 0 && <ChevronRight size={14} />}
            {index === crumbs.length - 1 ? (
              <span aria-current="page">{crumb.label}</span>
            ) : (
              <Link href={crumb.href}>{crumb.label}</Link>
            )}
          </span>
        ))}
      </nav>
    </header>
  );
}
