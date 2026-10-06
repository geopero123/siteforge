"use client";
/* Screenshots use private signed URLs and native proportions. */
/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import type { StoredIssue, Snapshot } from "./audit-types";
export function IssueDetail({
  issue,
  screenshots,
  close,
  setStatus,
  rerun,
  busy,
}: {
  issue: StoredIssue;
  screenshots: Snapshot["screenshots"];
  close: () => void;
  setStatus: (s: StoredIssue["status"]) => void;
  rerun: () => void;
  busy: boolean;
}) {
  const f = issue.data;
  const sourceFinding = f.url.startsWith("https://github.com/");
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previous = document.activeElement;
    closeRef.current?.focus();
    return () => {
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, []);
  return (
    <aside
      role="dialog"
      aria-modal="true"
      aria-labelledby="issue-title"
      className="detail"
      onKeyDown={(e) => {
        if (e.key === "Tab") {
          const targets = e.currentTarget.querySelectorAll<HTMLElement>(
            "button,a[href],summary",
          );
          const first = targets[0],
            last = targets[targets.length - 1];
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last?.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first?.focus();
          }
        }
      }}
    >
      <button
        ref={closeRef}
        className="close"
        aria-label="Close issue"
        onClick={close}
      >
        <X size={22} />
      </button>
      <div className="eyebrow">ISSUE / {issue.id.slice(0, 8)}</div>
      <span className={"badge " + f.severity}>{f.severity}</span>{" "}
      <span className="badge">{f.category}</span>
      <h2 id="issue-title">{f.title}</h2>
      <p>{f.description}</p>
      <small>
        {Math.round(f.confidence * 100)}% confidence ·{" "}
        {sourceFinding
          ? "Source code"
          : f.viewport
            ? `${f.viewport.width} × ${f.viewport.height}`
            : "All viewports"}{" "}
        · {issue.status}
        {sourceFinding && (
          <>
            {" · "}
            <a href={f.url} target="_blank" rel="noreferrer">
              Open on GitHub ↗
            </a>
          </>
        )}
      </small>
      <h3>Evidence</h3>
      {f.evidence.map((e, i) => {
        const shot =
          e.type === "screenshot"
            ? screenshots.find((s) => s.path === e.reference)
            : undefined;
        return (
          <div key={i} style={{ marginBottom: 10 }}>
            {shot && <img src={shot.signedUrl} alt={e.detail} />}
            <div className="evidence">
              <span className="code">{e.type.toUpperCase()}</span>
              <br />
              {e.type === "source" ? <pre>{e.detail}</pre> : e.detail}
            </div>
          </div>
        );
      })}
      <h3>Reproduce</h3>
      <ol style={{ color: "var(--muted)", paddingLeft: 20 }}>
        {f.reproductionSteps.map((s, i) => (
          <li key={i}>{s}</li>
        ))}
      </ol>
      <h3>Suggested fix</h3>
      <p>{f.suggestedFix}</p>
      {f.sourceFiles.length > 0 && (
        <>
          <h3>{sourceFinding ? "Location" : "Likely source files"}</h3>
          {f.sourceFiles.map((s) => (
            <div key={s.path} className="evidence">
              {sourceFinding ? (
                <a href={f.url} target="_blank" rel="noreferrer">
                  {s.path}
                  {s.lines && ":" + s.lines} ↗
                </a>
              ) : (
                <>
                  {s.path}:{s.lines}
                </>
              )}
              <br />
              {s.reason}
            </div>
          ))}
        </>
      )}
      {f.patch && (
        <>
          <h3>
            Suggested patch <small> / review before applying</small>
          </h3>
          <pre>{f.patch}</pre>
          <button
            className="button small"
            onClick={() => {
              const blob = new Blob([f.patch!], { type: "text/plain" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = "siteforge-" + issue.id + ".patch";
              a.click();
              URL.revokeObjectURL(url);
            }}
          >
            Download diff
          </button>
        </>
      )}
      <div className="detail-actions">
        <button
          disabled={busy}
          className="button primary"
          onClick={() =>
            setStatus(issue.status === "resolved" ? "open" : "resolved")
          }
        >
          {issue.status === "resolved" ? "Reopen" : "Mark resolved"}
        </button>
        <button
          disabled={busy}
          className="button"
          onClick={() =>
            setStatus(issue.status === "ignored" ? "open" : "ignored")
          }
        >
          {issue.status === "ignored" ? "Reopen" : "Ignore issue"}
        </button>
        <button disabled={busy} className="button" onClick={rerun}>
          Recheck with new scan
        </button>
      </div>
      <small style={{ display: "block", marginTop: 12 }}>
        Recheck launches a new scan of the same targets. Compare the new report
        before marking this issue resolved.
      </small>
    </aside>
  );
}
