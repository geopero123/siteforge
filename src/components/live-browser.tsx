/* The browser preview is a signed private storage image. */
/* eslint-disable @next/next/no-img-element */
import { Monitor, Radio } from "lucide-react";
import type { Snapshot } from "./audit-types";
export function LiveBrowser({
  frame,
  queued,
  activity,
}: {
  frame?: Snapshot["screenshots"][number];
  queued: boolean;
  activity?: string;
}) {
  return (
    <section className="panel live-browser">
      <div className="panel-title">
        <h2>
          <Monitor size={17} /> Browser preview
        </h2>
        <span className="badge">
          <Radio size={12} />{" "}
          {queued ? "Waiting" : frame ? "Live" : "Connecting"}
        </span>
      </div>
      <div className="browser-address mono">
        {frame?.url ?? "Waiting for the browser to load a page…"}
      </div>
      {frame ? (
        <div className="browser-screen">
          <img
            src={frame.signedUrl}
            alt={`Live audit browser at ${frame.url}`}
          />
        </div>
      ) : (
        <div className="empty">
          {queued
            ? "The browser opens when a worker starts this audit."
            : "The first browser frame will appear shortly."}
        </div>
      )}
      <div className="browser-caption">
        <span>{activity ?? "Preparing browser checks"}</span>
        {frame && (
          <small>
            {frame.viewport.width} × {frame.viewport.height} · Captured{" "}
            {new Date(frame.created_at).toLocaleTimeString()}
          </small>
        )}
      </div>
      <small>
        Actual browser captures, refreshed about every 3 seconds. View only.
      </small>
    </section>
  );
}
