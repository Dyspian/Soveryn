export default function LoadingDashboard() {
  return (
    <section className="space-y-5" role="status" aria-label="Loading the command center">
      <div className="panel h-24" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="panel h-16" />
        <div className="panel h-16" />
        <div className="panel h-16" />
        <div className="panel h-16" />
      </div>
      <p className="text-sm text-muted">Loading the character…</p>
    </section>
  );
}
