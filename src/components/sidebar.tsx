"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Folder,
  ScanLine,
  Target,
  Settings,
  LogOut,
} from "lucide-react";
import { Brand } from "./brand";
import { browserDb } from "@/lib/supabase/client";
export function Sidebar({ email }: { email: string }) {
  const path = usePathname();
  const router = useRouter();
  const links = [
    ["/dashboard", "Overview", LayoutDashboard],
    ["/dashboard/projects", "Projects", Folder],
    ["/dashboard/new", "New audit", ScanLine],
    ["/dashboard/missions", "Mission runner", Target],
    ["/dashboard/settings", "Settings", Settings],
  ] as const;
  return (
    <aside className="sidebar">
      <Brand />
      <div className="nav-label">WORKSPACE</div>
      <nav>
        {links.map(([href, label, Icon]) => (
          <Link
            key={href}
            href={href}
            className={path === href ? "active" : ""}
          >
            <Icon size={16} />
            {label}
          </Link>
        ))}
      </nav>
      <div className="sidebar-bottom">
        <p>{email}</p>
        <button
          className="button small"
          onClick={async () => {
            await browserDb().auth.signOut();
            router.push("/");
            router.refresh();
          }}
        >
          <LogOut size={12} />
          Sign out
        </button>
      </div>
    </aside>
  );
}
