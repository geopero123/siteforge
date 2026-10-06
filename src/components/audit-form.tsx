"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowRight,
  CircleAlert,
  Code2,
  Layers,
  Target,
  Zap,
} from "lucide-react";
import { formatRepository, parseRepository } from "@/lib/repository/reference";
interface Project {
  id: string;
  name: string;
  url: string | null;
  repository: string | null;
}
type Mode = "quick" | "full" | "mission" | "repository";

const modes: Array<{
  value: Mode;
  title: string;
  text: string;
  icon: typeof Zap;
}> = [
  {
    value: "quick",
    title: "Quick scan",
    text: "Homepage and one more page",
    icon: Zap,
  },
  {
    value: "full",
    title: "Full audit",
    text: "Up to five pages across site sections",
    icon: Layers,
  },
  {
    value: "mission",
    title: "Mission",
    text: "Test one user goal step by step",
    icon: Target,
  },
  {
    value: "repository",
    title: "Code only",
    text: "Scan a GitHub repository, no browser",
    icon: Code2,
  },
];

function defaultName(url: string, repository: string) {
  try {
    if (url) return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    /* Leave the name for the user to fill in. */
  }
  return repository.split("#")[0].split("/").pop() ?? "";
}

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
  // A target from the URL selects its project, or starts a new one for it.
  const fromQuery = !!(initialUrl || initialRepository);
  const start = fromQuery
    ? projects.find((p) =>
        initialUrl ? p.url === initialUrl : p.repository === initialRepository,
      )
    : projects[0];
  const startUrl = initialUrl || (fromQuery ? "" : (start?.url ?? ""));
  const startRepository = initialRepository || start?.repository || "";
  const [projectId, setProject] = useState(start?.id ?? ""),
    [url, setUrl] = useState(startUrl),
    [name, setName] = useState(
      start ? "" : defaultName(startUrl, startRepository),
    ),
    [repository, setRepository] = useState(startRepository),
    [mode, setMode] = useState<Mode>(
      missionMode
        ? "mission"
        : !startUrl && startRepository
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
            setProject(id);
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
          setBusy(false);
        }
      }}
    >
      {error && (
        <div role="alert" className="alert error">
          <CircleAlert size={16} />
          <div>
            {error}
            {needsCredits && (
              <p>
                <Link className="button small" href="/dashboard/billing">
                  Get test credits
                </Link>
              </p>
            )}
          </div>
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
      <fieldset className="mode-picker">
        <legend>What should SiteForge run?</legend>
        {modes.map(({ value, title, text, icon: Icon }) => (
          <label className="mode-option" key={value}>
            <input
              type="radio"
              name="mode"
              value={value}
              checked={mode === value}
              onChange={() => setMode(value)}
            />
            <Icon size={18} />
            <strong>{title}</strong>
            <span>{text}</span>
          </label>
        ))}
      </fieldset>
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
        <span>
          GitHub repository{" "}
          <small>{codeOnly ? "· required" : "· optional"}</small>
        </span>
        <input
          value={repository}
          onChange={(e) => setRepository(e.target.value)}
          required={codeOnly}
          placeholder="owner/repo or https://github.com/owner/repo"
          aria-invalid={!!repositoryError}
          aria-describedby="repository-help"
          spellCheck={false}
        />
      </label>
      <small
        id="repository-help"
        className={"field-help" + (repositoryError ? " error" : "")}
      >
        {repositoryError ||
          (codeOnly
            ? "Reads the whole repository: leaked secrets, vulnerable dependencies, risky code, CI and container setup, plus an AI code review with suggested patches."
            : repository.trim()
              ? "The repository is also scanned in full, and website findings are linked to the files that likely cause them."
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
              placeholder="Open the mobile menu and find the contact form"
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
      <button className="button primary large" disabled={busy}>
        {busy
          ? "Queuing audit…"
          : codeOnly
            ? "Scan repository"
            : repository.trim()
              ? "Audit website and code"
              : "Run browser audit"}
        {!busy && <ArrowRight size={16} />}
      </button>
      <p className="form-hint">
        Each audit uses one test credit when paid access is enabled.{" "}
        <Link href="/dashboard/billing">View balance and plans</Link>.{" "}
        {codeOnly
          ? "Repositories are read-only: SiteForge never pushes, opens pull requests or applies patches."
          : "Scans use 1440 × 900, 768 × 1024 and 390 × 844 viewports and stay on the same origin."}
      </p>
    </form>
  );
}
