"use client";
import { useState } from "react";
import { browserDb } from "@/lib/supabase/client";
import { formatRepository, parseRepository } from "@/lib/repository/reference";
export function RepositoryForm({
  id,
  initial,
}: {
  id: string;
  initial: string | null;
}) {
  const [repo, setRepo] = useState(initial ?? ""),
    [message, setMessage] = useState(""),
    [failed, setFailed] = useState(false),
    [busy, setBusy] = useState(false);
  return (
    <form
      className="form"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setFailed(false);
        try {
          const normalized = repo.trim()
            ? formatRepository(parseRepository(repo))
            : null;
          const { error } = await browserDb()
            .from("projects")
            .update({ repository: normalized })
            .eq("id", id);
          if (error)
            throw new Error(
              error.message.includes("projects_target_check")
                ? "A project needs a website URL or a repository."
                : error.message,
            );
          setRepo(normalized ?? "");
          setMessage(
            normalized
              ? "Repository saved. Website audits will also scan its code and link findings to source files."
              : "Repository removed.",
          );
        } catch (e) {
          setFailed(true);
          setMessage((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <label>
        Repository
        <input
          value={repo}
          onChange={(e) => setRepo(e.target.value)}
          placeholder="owner/repo or https://github.com/owner/repo"
        />
      </label>
      <small className="field-help">
        Public repositories work without a token. Private repositories require a
        worker connection authorized for your account. Add #branch to scan a
        branch other than the default. Suggested diffs are never applied
        automatically.
      </small>
      <button className="button" disabled={busy}>
        {busy ? "Saving…" : "Save repository"}
      </button>
      {message && (
        <div
          role="status"
          className={"alert " + (failed ? "error" : "success")}
        >
          {message}
        </div>
      )}
    </form>
  );
}
