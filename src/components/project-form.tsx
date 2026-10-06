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
        Name
        <input name="name" required maxLength={100} />
      </label>
      <label>
        Website URL <small>optional if you add a repository</small>
        <input type="url" name="url" placeholder="https://example.com" />
      </label>
      <label>
        GitHub repository{" "}
        <small>optional · owner/repo or github.com link</small>
        <input
          name="repository"
          placeholder="https://github.com/your-team/website"
        />
      </label>
      <button disabled={busy} className="button primary">
        Create project →
      </button>
    </form>
  );
}
