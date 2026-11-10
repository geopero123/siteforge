"use client";
import { isAuthApiError } from "@supabase/supabase-js";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { browserDb } from "@/lib/supabase/client";

export type LoginMode = "sign-in" | "sign-up" | "recover" | "update-password";

const submitLabel: Record<LoginMode, string> = {
  "sign-in": "Sign in",
  "sign-up": "Create account",
  recover: "Send password reset link",
  "update-password": "Save password",
};

export function LoginForm({ mode }: { mode: LoginMode }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const updating = mode === "update-password";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const email = String(fields.get("email") ?? "").trim();
    const password = String(fields.get("password") ?? "");
    const callback = location.origin + "/auth/callback";
    setMessage("");
    setSubmitted(false);
    setBusy(true);

    try {
      const { auth } = browserDb();
      switch (mode) {
        case "sign-in": {
          const { error } = await auth.signInWithPassword({ email, password });
          if (error) throw error;
          break;
        }
        case "sign-up": {
          const { data, error } = await auth.signUp({
            email,
            password,
            options: { emailRedirectTo: callback },
          });
          if (error) throw error;
          if (!data.session) {
            setSubmitted(true);
            setMessage("If this email is new to SiteForge, check your inbox for a confirmation link and open it in this browser. If you already have an account, sign in or reset your password.");
            return;
          }
          break;
        }
        case "recover": {
          const { error } = await auth.resetPasswordForEmail(email, {
            redirectTo: callback,
          });
          if (error) throw error;
          setSubmitted(true);
          setMessage("If an account exists, you’ll receive a password reset link. Open it in this browser.");
          return;
        }
        case "update-password": {
          const { error } = await auth.updateUser({ password });
          if (error) throw error;
          break;
        }
      }
      router.replace("/dashboard");
      router.refresh();
    } catch (error) {
      if (isAuthApiError(error) && error.code === "email_address_not_authorized") {
        setMessage("SiteForge can currently send account emails to team addresses only.");
      } else {
        setMessage(error instanceof Error ? error.message : "Please try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      {message && (
        <p role={submitted ? "status" : "alert"} className={"alert " + (submitted ? "success" : "error")}>
          {message}
        </p>
      )}
      <form className="form" method="post" onSubmit={submit}>
        {!updating && (
          <label>
            Email address
            <input name="email" type="email" autoComplete="email" required />
          </label>
        )}
        {mode !== "recover" && (
          <label>
            {updating ? "New password" : "Password"}
            <input
              name="password"
              type="password"
              autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
              minLength={mode === "sign-in" ? undefined : 8}
              required
            />
          </label>
        )}
        <button disabled={busy} className="button primary large block">
          {busy ? "Please wait…" : submitLabel[mode]}
        </button>
      </form>
      {mode === "sign-in" ? (
        <p className="form-hint">
          <Link href="/login?mode=sign-up">Create an account</Link>{" · "}
          <Link href="/login?mode=recover">Forgot password?</Link>
        </p>
      ) : (
        <p className="form-hint">
          <Link href="/login">Back to sign in</Link>
          {mode === "sign-up" && (
            <>{" · "}<Link href="/login?mode=recover">Forgot password?</Link></>
          )}
        </p>
      )}
    </div>
  );
}
