"use client";
import { useState } from "react";
import { browserDb } from "@/lib/supabase/client";
export function RepositoryForm({
  id,
  initial,
}: {
  id: string;
  initial: string | null;
}) {
  const [repo, setRepo] = useState(initial ?? ""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <form
      className="form"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          if (repo && !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo))
            throw new Error("Use owner/repository");
          const { error } = await browserDb()
            .from("projects")
            .update({ repository: repo || null })
            .eq("id", id);
          if (error) throw error;
          setMessage(
            "Repository saved. Future audits will investigate relevant files.",
          );
        } catch (e) {
          setMessage((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <label>
        Read-only GitHub repository
        <input
          value={repo}
          onChange={(e) => setRepo(e.target.value)}
          placeholder="owner/repository"
        />
      </label>
      <small>
        Public repositories work without a token. Private repositories require a
        a worker connection authorized for your account. Suggested diffs are
        never applied automatically.
      </small>
      <button className="button" disabled={busy}>
        Save repository
      </button>
      {message && (
        <div role="status" className="alert">
          {message}
        </div>
      )}
    </form>
  );
}
