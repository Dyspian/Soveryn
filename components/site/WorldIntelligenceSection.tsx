import { getSql } from "@/lib/db";
import { ensureDatabase } from "@/lib/ready";
import { loadWorldIntelligence } from "@/lib/site/intelligence";
import { WorldIntelligencePanel } from "@/components/site/WorldIntelligencePanel";

export function WorldIntelligenceFallback() {
  return (
    <section id="intelligence" className="site-section" aria-labelledby="intelligence-title" aria-busy="true">
      <div className="mx-auto max-w-6xl px-4">
        <p className="kicker">Live world intelligence</p>
        <h2 id="intelligence-title" className="mt-2 font-serif text-3xl leading-tight tracking-wide md:text-4xl">
          A snapshot of the stored world.
        </h2>
        <p className="mt-4 text-sm text-muted" role="status">
          Loading the stored counts.
        </p>
        <div className="mt-8 grid gap-px border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
          {["Characters", "Political homes", "Public organizations", "Game constitutions"].map((label) => (
            <div key={label} className="bg-obsidian px-4 py-5">
              <p className="text-xs tracking-[0.14em] text-muted uppercase">{label}</p>
              <p className="mt-3 h-10 border border-line bg-panel" />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export async function WorldIntelligenceSection() {
  try {
    await ensureDatabase();
    const snapshot = await loadWorldIntelligence(await getSql());
    return <WorldIntelligencePanel initial={snapshot} />;
  } catch {
    return <WorldIntelligencePanel initial={null} />;
  }
}
