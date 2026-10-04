"use client";
import { useState } from "react";
import { browserDb } from "@/lib/supabase/client";
export function LoginForm() {
  const [email, setEmail] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <div className="stack">
      {message && (
        <div role="status" className="alert">
          {message}
        </div>
      )}
      <form
        className="form"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            const { error } = await browserDb().auth.signInWithOtp({
              email,
              options: { emailRedirectTo: location.origin + "/auth/callback" },
            });
            if (error) throw error;
            setMessage("Check your email for a secure sign-in link.");
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
        <button
          disabled={busy}
          className="button primary"
          style={{ width: "100%" }}
        >
          Send sign-in link →
        </button>
      </form>
      <button
        className="button"
        onClick={async () => {
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
        Continue with GitHub
      </button>
      <small>
        GitHub sign-in requires the provider to be enabled in Supabase.
        Repository access is configured separately.
      </small>
    </div>
  );
}
