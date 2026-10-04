"use client";
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <section className="panel">
      <h1>Workspace request failed</h1>
      <p>{error.message}</p>
      <p>Check Supabase configuration, database migrations and connectivity.</p>
      <button className="button" onClick={reset}>
        Try again
      </button>
    </section>
  );
}
