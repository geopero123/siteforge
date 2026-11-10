import { CircleAlert } from "lucide-react";
import { redirect } from "next/navigation";
import { Brand } from "@/components/brand";
import { LoginForm, type LoginMode } from "@/components/login-form";
import { ProductPreview } from "@/components/product-preview";
import { pageSession } from "@/lib/supabase/server";
export const metadata = { title: "Sign in" };
const copy: Record<LoginMode, { title: string; intro: string }> = {
  "sign-in": {
    title: "Sign in to SiteForge",
    intro: "Create projects, run audits and keep every report.",
  },
  "sign-up": {
    title: "Create a SiteForge account",
    intro: "Use your email address and a password with at least 8 characters.",
  },
  recover: {
    title: "Reset your password",
    intro: "Enter the email address for your SiteForge account.",
  },
  "update-password": {
    title: "Set a new password",
    intro: "Choose a password with at least 8 characters.",
  },
};
export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; mode?: string }>;
}) {
  const { error, mode: requestedMode } = await searchParams;
  const mode =
    requestedMode === "sign-up" ||
    requestedMode === "recover" ||
    requestedMode === "update-password"
      ? requestedMode
      : "sign-in";
  if (mode === "update-password" && !(await pageSession())) redirect("/login");
  const { title, intro } = copy[mode];
  return (
    <div className="auth-page">
      <main className="auth-panel">
        <div className="auth-card">
          <Brand />
          <h1>{title}</h1>
          <p>{intro}</p>
          {error === "link-expired" && (
            <div className="alert error" role="alert">
              <CircleAlert size={16} />
              <div>This link has expired or was opened in a different browser. Request a new link and open it in this browser.</div>
            </div>
          )}
          <LoginForm key={mode} mode={mode} />
        </div>
      </main>
      <aside className="auth-aside" aria-hidden>
        <h2>
          Every problem in your site and code, with the evidence and a fix.
        </h2>
        <ProductPreview withNote={false} />
      </aside>
    </div>
  );
}
