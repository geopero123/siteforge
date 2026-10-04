import { Brand } from "@/components/brand";
import { LoginForm } from "@/components/login-form";
export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <main className="panel login-card">
      <Brand />
      <h1>Your quality workspace.</h1>
      <p>Sign in to create projects and keep every audit.</p>
      {error && <div className="alert error">{error}</div>}
      <LoginForm />
    </main>
  );
}
