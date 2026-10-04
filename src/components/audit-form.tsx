"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
interface Project {
  id: string;
  name: string;
  url: string;
}
export function AuditForm({
  projects,
  initialUrl = "",
  missionMode = false,
}: {
  projects: Project[];
  initialUrl?: string;
  missionMode?: boolean;
}) {
  const router = useRouter();
  const [projectId, setProject] = useState(projects[0]?.id ?? ""),
    [url, setUrl] = useState(initialUrl || projects[0]?.url || ""),
    [name, setName] = useState(""),
    [repository, setRepository] = useState(""),
    [mode, setMode] = useState(missionMode ? "mission" : "quick"),
    [mission, setMission] = useState(""),
    [allow, setAllow] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <form
      className="form"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        try {
          let id = projectId;
          if (!id) {
            const r = await fetch("/api/projects", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                name,
                url,
                ...(repository ? { repository } : {}),
              }),
            });
            const d = await r.json();
            if (!r.ok) throw new Error(d.error);
            id = d.id;
          }
          const r = await fetch("/api/audits", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              projectId: id,
              url,
              mode,
              mission: mode === "mission" ? mission : undefined,
              allowFormSubmission: allow,
            }),
          });
          const d = await r.json();
          if (!r.ok) throw new Error(d.error);
          router.push("/dashboard/audits/" + d.id);
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      {error && (
        <div role="alert" className="alert error">
          {error}
        </div>
      )}
      <label>
        Project
        <select
          value={projectId}
          onChange={(e) => {
            setProject(e.target.value);
            const p = projects.find((p) => p.id === e.target.value);
            if (p) setUrl(p.url);
          }}
        >
          <option value="">+ Create a new project</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      {!projectId && (
        <>
          <label>
            Project name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={100}
              placeholder="Marketing website"
            />
          </label>
          <label>
            GitHub repository <small>optional · owner/repository</small>
            <input
              value={repository}
              onChange={(e) => setRepository(e.target.value)}
              placeholder="your-team/website"
              pattern="[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+"
            />
          </label>
        </>
      )}
      <label>
        Website URL
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          required
          placeholder="https://example.com"
        />
      </label>
      <label>
        Audit mode
        <select value={mode} onChange={(e) => setMode(e.target.value)}>
          <option value="quick">
            Quick scan — homepage + one navigation page
          </option>
          <option value="full">Full audit — explore up to five pages</option>
          <option value="mission">Mission — test a specific user goal</option>
        </select>
      </label>
      {mode === "mission" && (
        <>
          <label>
            Mission objective
            <textarea
              value={mission}
              onChange={(e) => setMission(e.target.value)}
              required
              maxLength={1000}
              rows={4}
              placeholder="Test the mobile navigation and find the contact form"
            />
          </label>
          <label className="check-label">
            <input
              type="checkbox"
              checked={allow}
              onChange={(e) => setAllow(e.target.checked)}
            />
            <span>
              Allow form submissions and state-changing requests for this
              mission. Use a test environment and synthetic data. Purchases and
              destructive actions stay blocked.
            </span>
          </label>
        </>
      )}
      <p className="form-hint">
        Scans use 1440 × 900, 768 × 1024 and 390 × 844 viewports. Navigation
        stays on the same origin.
      </p>
      <button className="button primary" disabled={busy}>
        {busy ? "Queuing audit…" : "Launch real browser audit →"}
      </button>
    </form>
  );
}
