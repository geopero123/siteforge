"use client";
/* Screenshots are signed private storage URLs and must render at native proportions. */
/* eslint-disable @next/next/no-img-element */
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LoaderCircle, ChevronRight } from "lucide-react";
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
export function AuditView({ id }: { id: string }) {
  const router = useRouter();
  const [data, setData] = useState<Snapshot | null>(null),
    [error, setError] = useState(""),
    [search, setSearch] = useState(""),
    [severity, setSeverity] = useState(""),
    [category, setCategory] = useState(""),
    [page, setPage] = useState(""),
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
    return () => document.removeEventListener("keydown", listener);
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
    } finally {
      setBusy(false);
    }
  }
  async function setStatus(issue: StoredIssue, status: StoredIssue["status"]) {
    setBusy(true);
    try {
      const r = await fetch("/api/issues/" + issue.id, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
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
    return (
      <section className="panel">
        {error ? (
          <div className="alert error">
            {error}
            <button className="button small" onClick={() => void refresh()}>
              Retry
            </button>
          </div>
        ) : (
          <p>Loading saved audit evidence…</p>
        )}
      </section>
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
        (!page || findingLocation(i.data, audit.url) === page) &&
        (!search ||
          (i.data.title + " " + i.data.description)
            .toLowerCase()
            .includes(search.toLowerCase())),
    )
    .sort(
      (a, b) =>
        severities.indexOf(a.data.severity) -
        severities.indexOf(b.data.severity),
    );
  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">
            {audit.mode === "repository" ? "CODE" : audit.mode.toUpperCase()}{" "}
            AUDIT / {audit.id.slice(0, 8)}
          </div>
          <h1>
            {audit.url
              ? new URL(audit.url).hostname
              : audit.repository?.split("#")[0]}
          </h1>
          <p className="mono" style={{ fontSize: 12 }}>
            {[audit.url, audit.repository].filter(Boolean).join(" · ")}
          </p>
        </div>
        <div className="stack" style={{ gap: 10, justifyItems: "end" }}>
          <span className={"badge " + audit.status}>{audit.status}</span>
          {!running && (
            <button
              className="button"
              disabled={busy}
              onClick={() => void rerun()}
            >
              Run new scan ↗
            </button>
          )}
        </div>
      </div>
      {error && (
        <div role="alert" className="alert error">
          {error}
        </div>
      )}
      {audit.error && (
        <div className="alert error">
          <strong>Audit failed:</strong> {audit.error}
          <p style={{ margin: "8px 0 0" }}>
            Review worker logs and site availability, then run a new scan.
          </p>
        </div>
      )}
      {audit.report?.warnings.map((w, i) => (
        <div key={i} className="alert">
          Incomplete coverage: {w}
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
                <div className="alert">
                  This audit is queued. Progress appears when a worker picks it
                  up. If it stays queued, check your worker connection in
                  Settings.
                </div>
              )}
              <Activity events={events} />
            </section>
            <section className="panel" style={{ alignSelf: "start" }}>
              <h2>Agent activity</h2>
              {[
                ...(website ? ["browser", "accessibility", "visual"] : []),
                ...(audit.mode === "mission" ? ["mission"] : []),
                ...(audit.repository ? ["code", "dependencies"] : []),
                "report",
              ].map((agent) => {
                const last = events.filter((e) => e.agent === agent).at(-1);
                return (
                  <div className="agent-row" key={agent}>
                    <span>{agent} agent</span>
                    <span className={"badge " + (last?.status ?? "")}>
                      {last?.status ?? "waiting"}
                    </span>
                  </div>
                );
              })}
              <p style={{ marginTop: 24 }}>
                Completed checks and collected evidence appear here as the audit
                runs.
              </p>
            </section>
          </div>
        </>
      ) : (
        <>
          {audit.report && (
            <>
              <section className="panel score-layout">
                <div>
                  <div className="stat-label">
                    {audit.status === "partial"
                      ? "Score from completed checks"
                      : website
                        ? "Current site score"
                        : "Current code score"}
                  </div>
                  <div className="big-score">
                    {currentScore.overall}
                    <small> / 100</small>
                  </div>
                  <small>Original audit: {audit.report.score.overall}</small>
                </div>
                <div>
                  <div className="score-grid">
                    {scope.map((c) => (
                      <div key={c} className="score-item">
                        <span>
                          {c === "responsive" ? "Responsive design" : c}
                          <strong className="mono">
                            {currentScore.categories[c]}
                          </strong>
                        </span>
                        <div className="bar">
                          <i
                            style={{ width: currentScore.categories[c] + "%" }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                  <p style={{ fontSize: 11, marginTop: 22, marginBottom: 0 }}>
                    Severity × confidence deductions, averaged over{" "}
                    {scope.length} categories.{" "}
                    <Link
                      href="/dashboard/settings"
                      style={{ textDecoration: "underline" }}
                    >
                      See scoring method
                    </Link>
                    . Review coverage before interpreting this score.
                  </p>
                </div>
              </section>
              <p>{audit.report.summary}</p>
              {audit.report.repository && (
                <section className="panel" style={{ marginBottom: 24 }}>
                  <h2>Repository</h2>
                  <p className="mono" style={{ fontSize: 12 }}>
                    <a
                      href={`https://github.com/${audit.report.repository.name}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {audit.report.repository.name} ↗
                    </a>{" "}
                    · {audit.report.repository.branch}
                    {audit.report.repository.commit &&
                      " @ " + audit.report.repository.commit.slice(0, 7)}
                  </p>
                  <p style={{ marginBottom: 0 }}>
                    {audit.report.repository.files} files indexed ·{" "}
                    {audit.report.repository.analyzedFiles} checked by static
                    rules · {audit.report.repository.reviewedFiles} AI-reviewed
                    · {audit.report.repository.dependencies} dependency versions
                    checked
                  </p>
                </section>
              )}
              {audit.report.mission && (
                <section className="panel" style={{ marginBottom: 24 }}>
                  <h2>
                    Mission:{" "}
                    <span className="badge">
                      {audit.report.mission.outcome}
                    </span>
                  </h2>
                  <p>{audit.mission}</p>
                  <p>{audit.report.mission.summary}</p>
                  {audit.report.mission.evidence?.map((e, i) => (
                    <div className="evidence" key={i}>
                      Step {e.step}: {e.observation}
                    </div>
                  ))}
                </section>
              )}
            </>
          )}
          <section className="panel" style={{ padding: 0 }}>
            <div style={{ padding: "22px 22px 0" }}>
              <div className="panel-title">
                <h2>
                  Issue explorer <small> / {issues.length}</small>
                </h2>
                <span className="mono muted" style={{ fontSize: 11 }}>
                  {issues.filter((i) => i.status === "open").length} OPEN
                </span>
              </div>
              <div className="filters">
                <input
                  aria-label="Search issues"
                  placeholder="Search findings…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <select
                  aria-label="Filter severity"
                  value={severity}
                  onChange={(e) => setSeverity(e.target.value)}
                >
                  <option value="">All severities</option>
                  {severities.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
                <select
                  aria-label="Filter category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                >
                  <option value="">All categories</option>
                  {shownCategories.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
                <select
                  aria-label="Filter location"
                  value={page}
                  onChange={(e) => setPage(e.target.value)}
                >
                  <option value="">All locations</option>
                  {locations.map((location) => (
                    <option value={location} key={location}>
                      {location}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {filtered.map((i) => (
              <button
                className="issue-row"
                key={i.id}
                onClick={() => setSelected(i.id)}
              >
                <span className={"badge " + i.data.severity}>
                  {i.data.severity}
                </span>
                <span className="issue-copy">
                  <strong>{i.data.title}</strong>
                  <small>
                    {i.data.category} · {findingLocation(i.data, audit.url)}
                    {i.data.viewport
                      ? ` · ${i.data.viewport.width}px`
                      : ""} · {Math.round(i.data.confidence * 100)}% confidence
                  </small>
                </span>
                <span className={"badge " + i.status}>{i.status}</span>
                <ChevronRight size={16} />
              </button>
            ))}
            {!filtered.length && (
              <div className="empty">
                {issues.length
                  ? "No issues match these filters."
                  : "No findings were recorded. Review coverage and warnings."}
              </div>
            )}
          </section>
          {screenshots.length > 0 && (
            <section style={{ marginTop: 30 }}>
              <h2>Captured viewports</h2>
              <div className="grid-3">
                {screenshots.map((s) => (
                  <a
                    className="shot"
                    key={s.id}
                    href={s.signedUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <img
                      src={s.signedUrl}
                      alt={`Captured ${s.viewport.name} state of ${s.url}`}
                      loading="lazy"
                    />
                    <p className="mono">
                      {s.viewport.width} × {s.viewport.height} ·{" "}
                      {new URL(s.url).pathname}
                    </p>
                  </a>
                ))}
              </div>
            </section>
          )}
          <details>
            <summary>Coverage & technical checks</summary>
            <div className="panel">
              <ul>
                {audit.report?.coverage.map((c, i) => (
                  <li key={i} className="mono" style={{ fontSize: 11 }}>
                    {c}
                  </li>
                ))}
              </ul>
              {Object.entries(audit.report?.checks ?? {}).map(([k, v]) => (
                <p key={k}>
                  <strong>{k}:</strong> {v}
                </p>
              ))}
            </div>
          </details>
          {steps.length > 0 && (
            <details open>
              <summary>Mission tool execution / {steps.length} steps</summary>
              {steps.map((s) => (
                <div
                  className="evidence"
                  key={s.id}
                  style={{ marginBottom: 8 }}
                >
                  <strong>{s.tool}</strong>
                  <pre>
                    {JSON.stringify(
                      { arguments: s.args, result: s.result },
                      null,
                      2,
                    )}
                  </pre>
                </div>
              ))}
            </details>
          )}
          <details>
            <summary>Chronological activity log</summary>
            <Activity events={events} />
          </details>
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
