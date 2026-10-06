"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
export function ProjectForm() {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const router = useRouter();
  return (
    <form
      className="form"
      onSubmit={async (e) => {
        e.preventDefault();
        const values = new FormData(e.currentTarget);
        setBusy(true);
        try {
          const r = await fetch("/api/projects", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: values.get("name"),
              ...(values.get("url") ? { url: values.get("url") } : {}),
              ...(values.get("repository")
                ? { repository: values.get("repository") }
                : {}),
            }),
          });
          const d = await r.json();
          if (!r.ok) throw new Error(d.error);
          router.push("/dashboard/projects/" + d.id);
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      {error && <div className="alert error">{error}</div>}
      <label>
        Project name
        <input
          name="name"
          required
          maxLength={100}
          placeholder="Marketing website"
        />
      </label>
      <label>
        <span>
          Website URL <small>· optional with a repository</small>
        </span>
        <input type="url" name="url" placeholder="https://example.com" />
      </label>
      <label>
        <span>
          GitHub repository <small>· optional</small>
        </span>
        <input
          name="repository"
          placeholder="owner/repo or https://github.com/owner/repo"
        />
      </label>
      <button disabled={busy} className="button primary">
        {busy ? "Creating…" : "Create project"}
      </button>
    </form>
  );
}
