export default function LoadingCharacter() {
  return (
    <section className="space-y-5" role="status" aria-label="Loading the character">
      <div className="panel h-28" />
      <p className="text-sm text-muted">Loading the character…</p>
    </section>
  );
}
