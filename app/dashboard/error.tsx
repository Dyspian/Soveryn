"use client";

export default function DashboardError({ reset }: { error: Error; reset: () => void }) {
  return (
    <section className="panel" role="alert">
      <h1 className="section-title">The command center could not load</h1>
      <p className="mt-2 text-sm text-muted">The character record could not be read.</p>
      <button type="button" className="btn btn-secondary mt-3" onClick={() => reset()}>
        Try again
      </button>
    </section>
  );
}
