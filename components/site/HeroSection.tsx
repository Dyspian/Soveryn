import { BetaStatus } from "@/components/site/BetaStatus";
import { PrimaryAction } from "@/components/site/PrimaryAction";
import { siteEntry, type SiteVisitor } from "@/components/site/visitor";

export function HeroSection({ visitor }: { visitor: SiteVisitor }) {
  const entry = siteEntry(visitor);
  return (
    <section className="site-hero" aria-labelledby="hero-title">
      <div className="site-hero-media" aria-hidden="true" />
      <div className="site-hero-shade" aria-hidden="true" />
      <div className="site-hero-grid" aria-hidden="true" />
      <div className="relative z-10 mx-auto w-full min-w-0 max-w-6xl px-4 pt-28 pb-16 md:pb-24">
        <p className="kicker">Persistent world</p>
        <h1 id="hero-title" className="page-title mt-3 max-w-[12ch]">
          Build your power. Shape your world.
        </h1>
        <p className="mt-5 max-w-xl text-base text-ink/90 md:text-lg">
          SOVERYN is a persistent multiplayer sandbox on a real-world map. Create one character, choose a real starting
          city, then work, travel, trade, and organize in a world that continues while you are away.
        </p>
        <div className="mt-6">
          <BetaStatus />
        </div>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <PrimaryAction href={entry.href}>{entry.label}</PrimaryAction>
          <PrimaryAction href="#world" emphasis="secondary">
            Explore the world
          </PrimaryAction>
        </div>
      </div>
    </section>
  );
}
