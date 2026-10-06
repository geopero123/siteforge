"use client";
import { CircleAlert, RefreshCw } from "lucide-react";
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <div className="empty" role="alert">
      <CircleAlert size={30} color="var(--critical)" />
      <h2>Something went wrong loading this page</h2>
      <p>{error.message}</p>
      <p>Check Supabase configuration, database migrations and connectivity.</p>
      <button className="button" onClick={reset}>
        <RefreshCw size={14} /> Try again
      </button>
    </div>
  );
}
