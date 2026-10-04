import { CheckCircle2, LoaderCircle, AlertTriangle } from "lucide-react";
import type { Snapshot } from "./audit-types";
export function Activity({ events }: { events: Snapshot["events"] }) {
  return (
    <div className="activity">
      {events.map((e) => (
        <div className="activity-entry" key={e.id}>
          {e.status === "complete" ? (
            <CheckCircle2 size={16} />
          ) : e.status === "running" ? (
            <LoaderCircle size={16} className="spinner" />
          ) : (
            <AlertTriangle size={16} />
          )}
          <div>
            <time>{new Date(e.created_at).toLocaleTimeString()}</time>
            <strong> / {e.agent}</strong>
            <p>{e.message}</p>
          </div>
        </div>
      ))}
      {!events.length && <p>No worker events yet.</p>}
    </div>
  );
}
