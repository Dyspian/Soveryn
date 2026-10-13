"use client";

export default function RouteError({ reset }: { error: Error; reset: () => void }) {
  return (
    <section className="panel max-w-xl" role="alert">
      <h1 className="section-title">This page could not be loaded</h1>
      <p className="mt-2 text-sm text-muted">The request failed. Try again, or use the navigation to open another part of the game.</p>
      <button type="button" className="btn btn-secondary mt-3" onClick={() => reset()}>
        Try again
      </button>
    </section>
  );
}
