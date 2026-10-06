"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { formatRepository, parseRepository } from "@/lib/repository/reference";
interface Project {
  id: string;
  name: string;
  url: string | null;
  repository: string | null;
}
type Mode = "quick" | "full" | "mission" | "repository";
export function AuditForm({
  projects,
  initialUrl = "",
  initialRepository = "",
  missionMode = false,
}: {
  projects: Project[];
  initialUrl?: string;
  initialRepository?: string;
  missionMode?: boolean;
}) {
  const router = useRouter();
  const first = projects[0];
  const [projectId, setProject] = useState(first?.id ?? ""),
    [url, setUrl] = useState(initialUrl || first?.url || ""),
    [name, setName] = useState(""),
    [repository, setRepository] = useState(
      initialRepository || first?.repository || "",
    ),
    [mode, setMode] = useState<Mode>(
      missionMode
        ? "mission"
        : !initialUrl && !first?.url && (initialRepository || first?.repository)
          ? "repository"
          : "quick",
    ),
    [mission, setMission] = useState(""),
    [allow, setAllow] = useState(false),
    [busy, setBusy] = useState(false),
    [needsCredits, setNeedsCredits] = useState(false),
    [error, setError] = useState("");
  const codeOnly = mode === "repository";
  let repositoryError = "";
  if (repository.trim())
    try {
      parseRepository(repository);
    } catch (e) {
      repositoryError = (e as Error).message;
    }
  return (
    <form
      className="form"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        setNeedsCredits(false);
        try {
          if (repositoryError) throw new Error(repositoryError);
          const repo = repository.trim()
            ? formatRepository(parseRepository(repository))
            : undefined;
          if (codeOnly && !repo)
            throw new Error("Enter a GitHub repository to scan its code.");
          if (!codeOnly && !url)
            throw new Error(
              "Enter a website URL, or choose “Code only” to scan just the repository.",
            );
          let id = projectId;
          if (!id) {
            const r = await fetch("/api/projects", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                name,
                ...(url && !codeOnly ? { url } : {}),
                ...(repo ? { repository: repo } : {}),
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
              ...(codeOnly ? {} : { url }),
              ...(repo ? { repository: repo } : {}),
              mode,
              mission: mode === "mission" ? mission : undefined,
              allowFormSubmission: allow,
            }),
          });
          const d = await r.json();
          if (r.status === 402) setNeedsCredits(true);
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
          {needsCredits && (
            <p>
              <Link className="button small" href="/dashboard/billing">
                Get test credits →
              </Link>
            </p>
          )}
        </div>
      )}
      <label>
        Project
        <select
          value={projectId}
          onChange={(e) => {
            setProject(e.target.value);
            const p = projects.find((p) => p.id === e.target.value);
            if (p) {
              setUrl(p.url ?? "");
              setRepository(p.repository ?? "");
              if (!p.url && p.repository) setMode("repository");
              else if (mode === "repository" && p.url) setMode("quick");
            }
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
      )}
      <label>
        Audit mode
        <select value={mode} onChange={(e) => setMode(e.target.value as Mode)}>
          <option value="quick">Quick scan — homepage + one other page</option>
          <option value="full">
            Full audit — up to five pages across site sections
          </option>
          <option value="mission">Mission — test a specific user goal</option>
          <option value="repository">
            Code only — scan a GitHub repository
          </option>
        </select>
      </label>
      {!codeOnly && (
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
      )}
      <label>
        GitHub repository{" "}
        <small>
          {codeOnly ? "required" : "optional"} · owner/repo or a github.com link
        </small>
        <input
          value={repository}
          onChange={(e) => setRepository(e.target.value)}
          required={codeOnly}
          placeholder="https://github.com/your-team/website"
          aria-invalid={!!repositoryError}
          aria-describedby="repository-help"
        />
      </label>
      <small id="repository-help">
        {repositoryError ||
          (codeOnly
            ? "SiteForge reads the whole repository: leaked secrets, vulnerable dependencies, risky code, CI and container setup, plus an AI code review with suggested patches."
            : repository.trim()
              ? "The repository is also scanned in full, and website findings are linked to the source files that likely cause them."
              : "Add a repository to also scan its code and link website problems to source files.")}
      </small>
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
        Each audit uses one test credit when paid access is enabled.{" "}
        <Link href="/dashboard/billing">View your balance and plans ↗</Link>
        <br />
        {codeOnly
          ? "Repositories are read-only: SiteForge never pushes, opens pull requests or applies patches."
          : "Scans use 1440 × 900, 768 × 1024 and 390 × 844 viewports. Navigation stays on the same origin."}
      </p>
      <button className="button primary" disabled={busy}>
        {busy
          ? "Queuing audit…"
          : codeOnly
            ? "Scan repository →"
            : repository.trim()
              ? "Audit website and code →"
              : "Launch real browser audit →"}
      </button>
    </form>
  );
}
