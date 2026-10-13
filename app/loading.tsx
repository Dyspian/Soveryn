export default function Loading() {
  return (
    <section className="space-y-4" role="status" aria-label="Loading">
      <div className="panel h-16" />
      <div className="panel h-40" />
      <p className="text-sm text-muted">Loading…</p>
    </section>
  );
}
