"use client";
/* Screenshots use private signed URLs and native proportions. */
/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState } from "react";
import {
  Check,
  Copy,
  Download,
  ExternalLink,
  FileCode2,
  RefreshCw,
  X,
} from "lucide-react";
import type { StoredIssue, Snapshot } from "./audit-types";
import { StatusBadge, categoryLabel } from "./ui";

function DiffView({ patch, name }: { patch: string; name: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="diff">
      <div className="diff-toolbar">
        <button
          className="button small"
          onClick={async () => {
            await navigator.clipboard.writeText(patch);
            setCopied(true);
            setTimeout(() => setCopied(false), 1600);
          }}
        >
          {copied ? <Check size={13} /> : <Copy size={13} />}
          {copied ? "Copied" : "Copy"}
        </button>
        <button
          className="button small"
          onClick={() => {
            const blob = new Blob([patch], { type: "text/plain" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = name;
            a.click();
            URL.revokeObjectURL(url);
          }}
        >
          <Download size={13} /> Download .patch
        </button>
      </div>
      <div className="diff-lines">
        {patch.split("\n").map((line, index) => (
          <div
            key={index}
            className={
              line.startsWith("+++") || line.startsWith("---")
                ? "file"
                : line.startsWith("@@")
                  ? "hunk"
                  : line.startsWith("+")
                    ? "add"
                    : line.startsWith("-")
                      ? "del"
                      : undefined
            }
          >
            {line || " "}
          </div>
        ))}
      </div>
    </div>
  );
}

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
    <>
      <div className="backdrop" onClick={close} aria-hidden />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="issue-title"
        className="detail"
        onKeyDown={(e) => {
          if (e.key === "Tab") {
            const targets = e.currentTarget.querySelectorAll<HTMLElement>(
              "button:not(:disabled),a[href],summary",
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
        <div className="detail-head">
          <div className="chips">
            <span className={"badge " + f.severity}>{f.severity}</span>
            <span className="chip">{categoryLabel(f.category)}</span>
            {issue.status !== "open" && <StatusBadge status={issue.status} />}
          </div>
          <button
            ref={closeRef}
            className="icon-button"
            aria-label="Close finding"
            onClick={close}
          >
            <X size={18} />
          </button>
        </div>
        <div className="detail-body">
          <h2 id="issue-title">{f.title}</h2>
          <div className="detail-meta">
            <span>{Math.round(f.confidence * 100)}% confidence</span>
            <span>
              {sourceFinding
                ? "Source code"
                : f.viewport
                  ? `${f.viewport.width} × ${f.viewport.height}`
                  : "All viewports"}
            </span>
            <a href={f.url} target="_blank" rel="noreferrer">
              {sourceFinding ? "Open on GitHub" : "Open page"}{" "}
              <ExternalLink size={12} />
            </a>
          </div>
          <p>{f.description}</p>

          <section className="detail-section">
            <h3>Suggested fix</h3>
            <div className="fix-box">{f.suggestedFix}</div>
          </section>

          {f.patch && (
            <section className="detail-section">
              <h3>
                Patch <small>Review before applying</small>
              </h3>
              <DiffView patch={f.patch} name={`siteforge-${issue.id}.patch`} />
            </section>
          )}

          {f.sourceFiles.length > 0 && (
            <section className="detail-section">
              <h3>{sourceFinding ? "Location" : "Likely source files"}</h3>
              {f.sourceFiles.map((s) => {
                const body = (
                  <>
                    <FileCode2 size={16} />
                    <span style={{ minWidth: 0 }}>
                      <span className="mono">
                        {s.path}
                        {s.lines && ":" + s.lines}
                      </span>
                      {!sourceFinding && <small>{s.reason}</small>}
                    </span>
                  </>
                );
                return sourceFinding ? (
                  <a
                    key={s.path}
                    className="source-link"
                    href={f.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {body}
                    <ExternalLink size={13} style={{ marginLeft: "auto" }} />
                  </a>
                ) : (
                  <div key={s.path} className="source-link">
                    {body}
                  </div>
                );
              })}
            </section>
          )}

          <section className="detail-section">
            <h3>Evidence</h3>
            {f.evidence.map((e, i) => {
              const shot =
                e.type === "screenshot"
                  ? screenshots.find((s) => s.path === e.reference)
                  : undefined;
              return (
                <div className="evidence" key={i}>
                  <span className="evidence-type">{e.type}</span>
                  <br />
                  {e.detail}
                  {shot && <img src={shot.signedUrl} alt={e.detail} />}
                </div>
              );
            })}
          </section>

          {f.reproductionSteps.length > 0 && (
            <section className="detail-section">
              <h3>{sourceFinding ? "Where to look" : "Reproduce"}</h3>
              <ol className="steps-list">
                {f.reproductionSteps.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ol>
            </section>
          )}
        </div>
        <div className="detail-actions">
          <button
            disabled={busy}
            className="button primary"
            onClick={() =>
              setStatus(issue.status === "resolved" ? "open" : "resolved")
            }
          >
            <Check size={15} />
            {issue.status === "resolved" ? "Reopen" : "Mark resolved"}
          </button>
          <button
            disabled={busy}
            className="button"
            onClick={() =>
              setStatus(issue.status === "ignored" ? "open" : "ignored")
            }
          >
            {issue.status === "ignored" ? "Reopen" : "Ignore"}
          </button>
          <button disabled={busy} className="button ghost" onClick={rerun}>
            <RefreshCw size={14} /> Recheck with a new scan
          </button>
          <small>
            A recheck scans the same targets again. Compare the new report
            before marking this resolved.
          </small>
        </div>
      </aside>
    </>
  );
}
