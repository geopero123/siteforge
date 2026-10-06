"use client";
import { useState } from "react";
import { Mail, MailCheck } from "lucide-react";
import { browserDb } from "@/lib/supabase/client";
import { GithubMark } from "./ui";
export function LoginForm() {
  const [email, setEmail] = useState(""),
    [message, setMessage] = useState(""),
    [sent, setSent] = useState(false),
    [busy, setBusy] = useState(false);
  return (
    <div className="stack">
      {message && (
        <div role="status" className={"alert " + (sent ? "success" : "error")}>
          {sent && <MailCheck size={16} />}
          <div>{message}</div>
        </div>
      )}
      <button
        className="button large block"
        onClick={async () => {
          setSent(false);
          try {
            const { error } = await browserDb().auth.signInWithOAuth({
              provider: "github",
              options: { redirectTo: location.origin + "/auth/callback" },
            });
            if (error) throw error;
          } catch (e) {
            setMessage((e as Error).message);
          }
        }}
      >
        <GithubMark size={17} /> Continue with GitHub
      </button>
      <div className="divider">or use your email</div>
      <form
        className="form"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setSent(false);
          try {
            const { error } = await browserDb().auth.signInWithOtp({
              email,
              options: { emailRedirectTo: location.origin + "/auth/callback" },
            });
            if (error) throw error;
            setSent(true);
            setMessage(`Check ${email} for a secure sign-in link.`);
          } catch (e) {
            setMessage((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Email address
          <input
            type="email"
            autoComplete="email"
            placeholder="you@company.com"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <button disabled={busy} className="button primary large block">
          <Mail size={16} />
          {busy ? "Sending link…" : "Email me a sign-in link"}
        </button>
      </form>
      <small>
        GitHub sign-in doesn’t grant repository access. Repositories are
        connected separately and read-only.
      </small>
    </div>
  );
}
