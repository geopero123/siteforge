"use client";
/* Screenshots are signed private storage URLs and must render at native proportions. */
/* eslint-disable @next/next/no-img-element */
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Camera,
  ChevronRight,
  CircleAlert,
  ClipboardList,
  Code2,
  FileText,
  Globe,
  History,
  LoaderCircle,
  RefreshCw,
  Search,
  Sparkles,
  Target,
} from "lucide-react";
import {
  severities,
  score,
  websiteCategories,
  type Category,
} from "@/lib/audit/schema";
import {
  findingLocation,
  type StoredIssue,
  type Snapshot,
} from "./audit-types";
import { Activity } from "./audit-activity";
import { IssueDetail } from "./issue-detail";
import { LiveBrowser } from "./live-browser";
import {
  CountUp,
  GithubMark,
  ScoreRing,
  StatusBadge,
  categoryLabel,
  displayTarget,
  modeLabel,
  relativeTime,
  scoreTone,
} from "./ui";

const statusOrder = { open: 0, resolved: 1, ignored: 2 };

export function AuditView({ id }: { id: string }) {
  const router = useRouter();
  const [data, setData] = useState<Snapshot | null>(null),
    [error, setError] = useState(""),
    [search, setSearch] = useState(""),
    [severity, setSeverity] = useState(""),
    [category, setCategory] = useState(""),
    [page, setPage] = useState(""),
    [status, setStatusFilter] = useState(""),
    [selected, setSelected] = useState<string | null>(null),
    [busy, setBusy] = useState(false);
  const polling = useRef(true);
  const refresh = useCallback(async () => {
    try {
      const r = await fetch("/api/audits/" + id, { cache: "no-store" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setData(d);
      setError("");
      polling.current = ["queued", "running"].includes(d.audit.status);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [id]);
  useEffect(() => {
    const initial = setTimeout(() => void refresh(), 0);
    const timer = setInterval(() => {
      if (polling.current) void refresh();
    }, 2500);
    return () => {
      clearTimeout(initial);
      clearInterval(timer);
    };
  }, [refresh]);
  useEffect(() => {
    if (!selected) return;
    const listener = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelected(null);
    };
    document.addEventListener("keydown", listener);
    // Keep the page behind the drawer still while it is open.
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", listener);
      document.body.style.overflow = overflow;
    };
  }, [selected]);
  async function rerun() {
    if (!data) return;
    setBusy(true);
    try {
      const r = await fetch("/api/audits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: data.audit.project_id,
          ...(data.audit.url ? { url: data.audit.url } : {}),
          ...(data.audit.repository
            ? { repository: data.audit.repository }
            : {}),
          // Missions need an objective; rechecks rerun the same targets as a quick scan.
          mode: data.audit.mode === "repository" ? "repository" : "quick",
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      router.push("/dashboard/audits/" + d.id);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  async function setStatus(issue: StoredIssue, next: StoredIssue["status"]) {
    setBusy(true);
    try {
      const r = await fetch("/api/issues/" + issue.id, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!data)
    return error ? (
      <div className="alert error" role="alert">
        <CircleAlert size={16} />
        <div>
          <strong>Couldn’t load this audit.</strong> {error}
          <p>
            <button className="button small" onClick={() => void refresh()}>
              <RefreshCw size={13} /> Retry
            </button>
          </p>
        </div>
      </div>
    ) : (
      <div className="stack" aria-busy="true" aria-label="Loading audit">
        <div className="skeleton" style={{ height: 34, width: "40%" }} />
        <div className="skeleton" style={{ height: 210 }} />
        <div className="skeleton" style={{ height: 320 }} />
      </div>
    );
  const { audit, issues, events, steps } = data;
  const liveFrame = data.screenshots.find((s) => s.viewport.name === "live");
  const screenshots = data.screenshots.filter(
    (s) => s.viewport.name !== "live",
  );
  const running = ["queued", "running"].includes(audit.status);
  const website = audit.mode !== "repository";
  const scope = (
    audit.report?.score.categories
      ? Object.keys(audit.report.score.categories)
      : websiteCategories
  ) as Category[];
  const currentScore = score(
    issues.map((i) => ({ ...i.data, status: i.status })),
    scope,
  );
  const open = issues.filter((i) => i.status === "open");
  const shownCategories = [
    ...new Set([...scope, ...issues.map((i) => i.data.category)]),
  ];
  const locations = [
    ...new Set(issues.map((i) => findingLocation(i.data, audit.url))),
  ].sort();
  const issue = issues.find((i) => i.id === selected);
  const filtered = issues
    .filter(
      (i) =>
        (!severity || i.data.severity === severity) &&
        (!category || i.data.category === category) &&
        (!status || i.status === status) &&
        (!page || findingLocation(i.data, audit.url) === page) &&
        (!search ||
          (i.data.title + " " + i.data.description)
            .toLowerCase()
            .includes(search.toLowerCase())),
    )
    .sort(
      (a, b) =>
        statusOrder[a.status] - statusOrder[b.status] ||
        severities.indexOf(a.data.severity) -
          severities.indexOf(b.data.severity),
    );
  const repoName = audit.repository?.split("#")[0];
  return (
    <>
      <div className="audit-head">
        <div style={{ minWidth: 0 }}>
          <div className="eyebrow">
            {modeLabel(audit.mode, !!audit.repository)} ·{" "}
            {relativeTime(audit.created_at)}
          </div>
          <h1>
            {displayTarget(audit)}
            <StatusBadge status={audit.status} />
          </h1>
          <div className="chips">
            {audit.url && (
              <a
                className="chip"
                href={audit.url}
                target="_blank"
                rel="noreferrer"
              >
                <Globe size={13} />
                {audit.url.replace(/^https?:\/\//, "")}
              </a>
            )}
            {repoName && (
              <a
                className="chip"
                href={"https://github.com/" + repoName}
                target="_blank"
                rel="noreferrer"
              >
                <GithubMark size={12} />
                {audit.repository}
              </a>
            )}
          </div>
        </div>
        <div className="page-actions">
          <Link
            className="button"
            href={"/dashboard/projects/" + audit.project_id}
          >
            <History size={15} /> Project history
          </Link>
          {!running && (
            <button
              className="button primary"
              disabled={busy}
              onClick={() => void rerun()}
            >
              <RefreshCw size={15} /> Run again
            </button>
          )}
        </div>
      </div>
      {error && (
        <div role="alert" className="alert error">
          <CircleAlert size={16} />
          <div>{error}</div>
        </div>
      )}
      {audit.error && (
        <div className="alert error">
          <CircleAlert size={16} />
          <div>
            <strong>This audit failed.</strong> {audit.error}
            <p>
              Failed audits don’t use a test credit. Check that the site or
              repository is reachable, then run it again.
            </p>
          </div>
        </div>
      )}
      {audit.report?.warnings.map((w, i) => (
        <div key={i} className="alert">
          <AlertTriangle size={16} />
          <div>{w}</div>
        </div>
      ))}
      {running ? (
        <>
          {website && (
            <LiveBrowser
              frame={liveFrame}
              queued={audit.status === "queued"}
              activity={events.at(-1)?.message}
            />
          )}
          <div className="grid-2">
            <section className="panel">
              <div className="panel-title">
                <h2>
                  {audit.status === "queued"
                    ? "Waiting for a worker"
                    : website
                      ? "Inspecting your website"
                      : "Scanning your repository"}
                </h2>
                <LoaderCircle size={18} className="spinner" />
              </div>
              {audit.status === "queued" && (
                <div className="alert info">
                  <History size={16} />
                  <div>
                    This audit is queued. Progress appears here as soon as a
                    worker picks it up.
                  </div>
                </div>
              )}
              <Activity events={events} />
            </section>
            <section className="panel" style={{ alignSelf: "start" }}>
              <h2>Checks</h2>
              {[
                ...(website ? ["browser", "accessibility", "visual"] : []),
                ...(audit.mode === "mission" ? ["mission"] : []),
                ...(audit.repository ? ["code", "dependencies"] : []),
                "report",
              ].map((agent) => {
                const last = events.filter((e) => e.agent === agent).at(-1);
                return (
                  <div className="agent-row" key={agent}>
                    <span>{agent}</span>
                    {last ? (
                      <StatusBadge status={last.status} />
                    ) : (
                      <span className="badge queued">Waiting</span>
                    )}
                  </div>
                );
              })}
              <p style={{ margin: "16px 0 0", fontSize: 13 }}>
                Findings appear as soon as the audit finishes. You can leave
                this page; the audit keeps running.
              </p>
            </section>
          </div>
        </>
      ) : (
        <>
          {audit.report && (
            <>
              <section className="panel score-layout">
                <ScoreRing score={currentScore.overall} />
                <div className="score-side">
                  <header>
                    <h2>
                      {audit.status === "partial"
                        ? "Score from completed checks"
                        : website
                          ? "Site health"
                          : "Code health"}
                    </h2>
                    <small>
                      {audit.report.score.overall !== currentScore.overall
                        ? `Was ${audit.report.score.overall} when the audit finished`
                        : `${open.length} open of ${issues.length} findings`}
                    </small>
                  </header>
                  <div className="severity-summary">
                    {severities.map((s, index) => {
                      const count = open.filter(
                        (i) => i.data.severity === s,
                      ).length;
                      return (
                        <button
                          type="button"
                          key={s}
                          className={`severity-count ${count ? "" : "zero"}`}
                          style={{
                            ["--tone" as string]: `var(--${s})`,
                            ["--i" as string]: index,
                          }}
                          onClick={() => {
                            setSeverity(severity === s ? "" : s);
                            setStatusFilter("open");
                            document
                              .getElementById("issues")
                              ?.scrollIntoView({ behavior: "smooth" });
                          }}
                          aria-label={`${count} open ${s} findings`}
                        >
                          <b>{count}</b> {s}
                        </button>
                      );
                    })}
                  </div>
                  <div
                    className="score-grid"
                    style={{
                      ["--cols" as string]:
                        scope.length <= 4
                          ? scope.length
                          : scope.length % 3
                            ? 4
                            : 3,
                    }}
                  >
                    {scope.map((c, index) => {
                      const value = currentScore.categories[c] ?? 100;
                      return (
                        <div
                          key={c}
                          className={`score-item ${scoreTone(value)}`}
                          style={{ ["--i" as string]: index }}
                        >
                          <span>
                            {categoryLabel(c)}
                            <strong>
                              <CountUp value={value} />
                            </strong>
                          </span>
                          <div className="bar">
                            <i style={{ width: value + "%" }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <p className="score-note">
                    Severity × confidence deductions, averaged over{" "}
                    {scope.length} categories.{" "}
                    <Link href="/dashboard/settings">How scoring works</Link>.
                    Review coverage before reading too much into it.
                  </p>
                </div>
              </section>
              {audit.report.summary && (
                <div className="summary-callout">
                  <Sparkles size={18} />
                  <p>{audit.report.summary}</p>
                </div>
              )}
              {audit.report.repository && (
                <section className="panel" style={{ marginBottom: 20 }}>
                  <div className="panel-title">
                    <h2>
                      <Code2 size={16} /> Repository scan
                    </h2>
                    <a
                      className="chip mono"
                      href={
                        "https://github.com/" +
                        audit.report.repository.name +
                        (audit.report.repository.commit
                          ? "/commit/" + audit.report.repository.commit
                          : "")
                      }
                      target="_blank"
                      rel="noreferrer"
                    >
                      <GithubMark size={12} />
                      {audit.report.repository.branch}
                      {audit.report.repository.commit &&
                        " @ " + audit.report.repository.commit.slice(0, 7)}
                    </a>
                  </div>
                  <div className="repo-stats">
                    <div>
                      <strong>
                        <CountUp value={audit.report.repository.files} />
                      </strong>
                      <span>files indexed</span>
                    </div>
                    <div>
                      <strong>
                        <CountUp
                          value={audit.report.repository.analyzedFiles}
                        />
                      </strong>
                      <span>checked by static rules</span>
                    </div>
                    <div>
                      <strong>
                        <CountUp
                          value={audit.report.repository.reviewedFiles}
                        />
                      </strong>
                      <span>reviewed by AI</span>
                    </div>
                    <div>
                      <strong>
                        <CountUp value={audit.report.repository.dependencies} />
                      </strong>
                      <span>dependency versions</span>
                    </div>
                  </div>
                </section>
              )}
              {audit.report.mission && (
                <section className="panel" style={{ marginBottom: 20 }}>
                  <div className="panel-title">
                    <h2>
                      <Target size={16} /> Mission
                    </h2>
                    <StatusBadge
                      status={
                        audit.report.mission.outcome === "SUCCESS"
                          ? "complete"
                          : audit.report.mission.outcome === "PARTIAL"
                            ? "partial"
                            : "failed"
                      }
                    />
                  </div>
                  <p style={{ color: "var(--text)" }}>“{audit.mission}”</p>
                  <p>{audit.report.mission.summary}</p>
                  <div className="mission-evidence">
                    {audit.report.mission.evidence?.map((e, i) => (
                      <div className="evidence" key={i}>
                        <span className="evidence-type">Step {e.step}</span>
                        <br />
                        {e.observation}
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
          <section className="panel flush" id="issues">
            <div className="panel-title" style={{ padding: "20px 20px 0" }}>
              <h2>
                <ClipboardList size={16} /> Findings{" "}
                <small>
                  {filtered.length === issues.length
                    ? issues.length
                    : `${filtered.length} of ${issues.length}`}
                </small>
              </h2>
              {(search || severity || category || page || status) && (
                <button
                  className="button ghost small"
                  onClick={() => {
                    setSearch("");
                    setSeverity("");
                    setCategory("");
                    setPage("");
                    setStatusFilter("");
                  }}
                >
                  Clear filters
                </button>
              )}
            </div>
            {issues.length > 0 && (
              <div className="filters">
                <div className="search-field">
                  <Search size={15} />
                  <input
                    aria-label="Search findings"
                    placeholder="Search findings…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <select
                  aria-label="Filter by severity"
                  value={severity}
                  onChange={(e) => setSeverity(e.target.value)}
                >
                  <option value="">All severities</option>
                  {severities.map((s) => (
                    <option key={s} value={s}>
                      {s[0].toUpperCase() + s.slice(1)}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="Filter by category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                >
                  <option value="">All categories</option>
                  {shownCategories.map((c) => (
                    <option key={c} value={c}>
                      {categoryLabel(c)}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="Filter by status"
                  value={status}
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  <option value="">All statuses</option>
                  <option value="open">Open</option>
                  <option value="resolved">Resolved</option>
                  <option value="ignored">Ignored</option>
                </select>
                {locations.length > 1 && (
                  <select
                    aria-label="Filter by location"
                    value={page}
                    onChange={(e) => setPage(e.target.value)}
                    style={{ gridColumn: "1 / -1" }}
                  >
                    <option value="">All pages and files</option>
                    {locations.map((location) => (
                      <option value={location} key={location}>
                        {location}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}
            <div className="issue-list">
              {filtered.map((i, index) => {
                const source = i.data.url.startsWith("https://github.com/");
                return (
                  <button
                    className={`issue-row ${i.data.severity} ${i.status === "open" ? "" : "is-closed"}`}
                    key={i.id}
                    style={{ ["--i" as string]: Math.min(index, 12) }}
                    onClick={() => setSelected(i.id)}
                  >
                    <span className={"badge " + i.data.severity}>
                      {i.data.severity}
                    </span>
                    <span className="issue-copy">
                      <strong>{i.data.title}</strong>
                      <span className="issue-meta">
                        <span>{categoryLabel(i.data.category)}</span>
                        <span>
                          {source ? (
                            <FileText size={12} />
                          ) : (
                            <Globe size={12} />
                          )}
                          <span className="mono">
                            {findingLocation(i.data, audit.url)}
                          </span>
                        </span>
                        {i.data.viewport && (
                          <span>{i.data.viewport.width}px</span>
                        )}
                        {i.data.confidence < 1 && (
                          <span>
                            {Math.round(i.data.confidence * 100)}% confidence
                          </span>
                        )}
                        {i.data.patch && <span>Patch available</span>}
                      </span>
                    </span>
                    <span className="issue-status">
                      {i.status !== "open" && <StatusBadge status={i.status} />}
                    </span>
                    <ChevronRight size={16} />
                  </button>
                );
              })}
              {!filtered.length && (
                <div className="empty">
                  {issues.length ? (
                    <p>No findings match these filters.</p>
                  ) : audit.report ? (
                    <>
                      <Sparkles size={26} />
                      <h2>No problems found</h2>
                      <p>
                        Every check that ran came back clean. Review coverage
                        below to see what was checked.
                      </p>
                    </>
                  ) : (
                    <p>No findings were recorded for this audit.</p>
                  )}
                </div>
              )}
            </div>
          </section>
          {screenshots.length > 0 && (
            <>
              <div className="section-title">
                <h2>
                  <Camera
                    size={16}
                    style={{ display: "inline", marginRight: 8 }}
                  />
                  Captured viewports
                </h2>
              </div>
              <div className="shot-grid">
                {screenshots.map((s) => (
                  <a
                    key={s.id}
                    href={s.signedUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <figure className="shot" style={{ margin: 0 }}>
                      <div className="shot-frame">
                        <img
                          src={s.signedUrl}
                          alt={`Captured ${s.viewport.name} view of ${s.url}`}
                          loading="lazy"
                        />
                      </div>
                      <figcaption>
                        <span className="mono">{new URL(s.url).pathname}</span>
                        <span>
                          {s.viewport.name} · {s.viewport.width} ×{" "}
                          {s.viewport.height}
                        </span>
                      </figcaption>
                    </figure>
                  </a>
                ))}
              </div>
            </>
          )}
          <div style={{ marginTop: 24 }}>
            {audit.report && (
              <details className="disclosure">
                <summary>
                  <FileText size={15} /> Coverage and checks
                </summary>
                <div>
                  <ul>
                    {audit.report.coverage.map((c, i) => (
                      <li key={i} className="mono">
                        {c}
                      </li>
                    ))}
                  </ul>
                  <div className="kv" style={{ marginTop: 16 }}>
                    {Object.entries(audit.report.checks ?? {}).map(([k, v]) => (
                      <div key={k}>
                        <span style={{ textTransform: "capitalize" }}>
                          {k.replace(/([A-Z])/g, " $1").toLowerCase()}
                        </span>
                        <span className="muted" style={{ textAlign: "right" }}>
                          {v}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </details>
            )}
            {steps.length > 0 && (
              <details className="disclosure" open>
                <summary>
                  <Target size={15} /> Mission steps / {steps.length}
                </summary>
                <div>
                  {steps.map((s, index) => (
                    <div className="evidence" key={s.id}>
                      <span className="evidence-type">
                        {index + 1}. {s.tool}
                      </span>
                      <pre>
                        {JSON.stringify(
                          { arguments: s.args, result: s.result },
                          null,
                          2,
                        )}
                      </pre>
                    </div>
                  ))}
                </div>
              </details>
            )}
            <details className="disclosure">
              <summary>
                <History size={15} /> Activity log / {events.length}
              </summary>
              <div>
                <Activity events={events} />
              </div>
            </details>
          </div>
        </>
      )}
      {issue && (
        <IssueDetail
          issue={issue}
          screenshots={screenshots}
          close={() => setSelected(null)}
          setStatus={(s) => void setStatus(issue, s)}
          rerun={() => void rerun()}
          busy={busy}
        />
      )}
    </>
  );
}
