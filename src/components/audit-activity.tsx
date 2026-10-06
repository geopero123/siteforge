import { Check, LoaderCircle, AlertTriangle, X } from "lucide-react";
import type { Snapshot } from "./audit-types";
export function Activity({ events }: { events: Snapshot["events"] }) {
  return (
    <div className="activity">
      {events.map((e) => (
        <div className="activity-entry" key={e.id}>
          <span className={"activity-icon " + e.status}>
            {e.status === "complete" ? (
              <Check size={12} />
            ) : e.status === "running" ? (
              <LoaderCircle size={12} className="spinner" />
            ) : e.status === "failed" ? (
              <X size={12} />
            ) : (
              <AlertTriangle size={12} />
            )}
          </span>
          <div>
            <header>
              <strong>{e.agent}</strong>
              <time dateTime={e.created_at}>
                {new Date(e.created_at).toLocaleTimeString()}
              </time>
            </header>
            <p>{e.message}</p>
          </div>
        </div>
      ))}
      {!events.length && <p>No worker events yet.</p>}
    </div>
  );
}
