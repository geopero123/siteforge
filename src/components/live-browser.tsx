/* The browser preview is a signed private storage image. */
/* eslint-disable @next/next/no-img-element */
import { Monitor, MonitorPlay } from "lucide-react";
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
          <Monitor size={16} /> Browser preview
        </h2>
        <span
          className={
            "badge dot " + (queued ? "queued" : frame ? "running" : "queued")
          }
        >
          {queued ? "Waiting" : frame ? "Live" : "Connecting"}
        </span>
      </div>
      <div className="browser-window">
        <div className="window-bar">
          <i />
          <i />
          <i />
          <span className="address">
            {frame?.url ?? "Waiting for the browser to load a page…"}
          </span>
        </div>
        {frame ? (
          <div className="browser-screen">
            <img
              src={frame.signedUrl}
              alt={`Live audit browser at ${frame.url}`}
            />
          </div>
        ) : (
          <div className="browser-empty">
            <MonitorPlay size={28} />
            {queued
              ? "The browser opens when a worker starts this audit."
              : "The first browser frame will appear shortly."}
          </div>
        )}
      </div>
      <div className="browser-caption">
        <span>{activity ?? "Preparing browser checks"}</span>
        <small>
          {frame
            ? `${frame.viewport.width} × ${frame.viewport.height} · captured ${new Date(frame.created_at).toLocaleTimeString()} · refreshes every ~3s`
            : "Real Chromium captures, view only"}
        </small>
      </div>
    </section>
  );
}
