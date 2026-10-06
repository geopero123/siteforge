import { CircleAlert } from "lucide-react";
import { Brand } from "@/components/brand";
import { LoginForm } from "@/components/login-form";
import { ProductPreview } from "@/components/product-preview";
export const metadata = { title: "Sign in" };
export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <div className="auth-page">
      <main className="auth-panel">
        <div className="auth-card">
          <Brand />
          <h1>Sign in to SiteForge</h1>
          <p>Create projects, run audits and keep every report.</p>
          {error && (
            <div className="alert error" role="alert">
              <CircleAlert size={16} />
              <div>{error}</div>
            </div>
          )}
          <LoginForm />
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
