"use client";
import { useState } from "react";
import { Mail, MailCheck } from "lucide-react";
import { browserDb } from "@/lib/supabase/client";
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
              provider: "google",
              options: { redirectTo: location.origin + "/auth/callback" },
            });
            if (error) throw error;
          } catch (e) {
            setMessage((e as Error).message);
          }
        }}
      >
        <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
          <path fill="#4285F4" d="M43.61 24.46c0-1.36-.12-2.66-.35-3.92H24v7.42h11a9.4 9.4 0 0 1-4.08 6.17v5.14h6.61c3.87-3.56 6.08-8.8 6.08-14.81Z" />
          <path fill="#34A853" d="M24 44c5.51 0 10.13-1.83 13.53-4.73l-6.61-5.14c-1.83 1.23-4.17 1.96-6.92 1.96-5.32 0-9.83-3.59-11.44-8.41H5.74v5.3A20 20 0 0 0 24 44Z" />
          <path fill="#FBBC05" d="M12.56 27.68a12 12 0 0 1 0-7.36v-5.3H5.74a20 20 0 0 0 0 17.96l6.82-5.3Z" />
          <path fill="#EA4335" d="M24 11.91c3 0 5.67 1.03 7.8 3.06l5.85-5.85A19.6 19.6 0 0 0 24 4 20 20 0 0 0 5.74 15.02l6.82 5.3c1.61-4.82 6.12-8.41 11.44-8.41Z" />
        </svg>
        Continue with Google
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
        GitHub repositories are connected separately and read-only.
      </small>
    </div>
  );
}
