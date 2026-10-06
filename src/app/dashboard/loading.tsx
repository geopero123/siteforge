export default function Loading() {
  return (
    <div className="stack" aria-busy="true" aria-label="Loading workspace">
      <div className="skeleton" style={{ height: 34, width: "32%" }} />
      <div className="skeleton" style={{ height: 16, width: "48%" }} />
      <div className="grid-4" style={{ marginTop: 12 }}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skeleton" style={{ height: 96 }} />
        ))}
      </div>
      <div className="skeleton" style={{ height: 320 }} />
    </div>
  );
}
