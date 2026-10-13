import Link from "next/link";
import { PrimaryAction } from "@/components/site/PrimaryAction";
import { SectionHeading } from "@/components/site/SectionHeading";
import { siteEntry, type SiteVisitor } from "@/components/site/visitor";

const pillars = [
  ["One character", "Skills, missions, and a recorded starting city."],
  ["Work and trade", "Shifts, businesses, jobs, and the player market."],
  ["Travel", "Move between recorded places. Your political home stays where you began."],
  ["Organizations", "Player groups, membership, and a shared treasury."],
  ["Politics", "Fictional offices, parties, and laws. These are not real governments."],
  ["Warfare", "Not in this version."],
];

export function WorldSection() {
  return (
    <section id="world" className="site-section" aria-labelledby="world-title">
      <div className="mx-auto grid min-w-0 max-w-6xl gap-12 px-4 lg:grid-cols-2 lg:items-start">
        <SectionHeading id="world-title" kicker="Real geography" title="A world already on the map.">
          <p>
            The map uses imported places and country boundaries. It is not a fictional continent. You choose an open
            starting city, and that city remains your character&apos;s recorded home when you travel.
          </p>
        </SectionHeading>
        <ul className="divide-y divide-line border-y border-line">
          {pillars.map(([title, detail]) => (
            <li key={title} className="grid gap-1 py-4 sm:grid-cols-[11rem_1fr] sm:gap-6">
              <p className="text-ink">{title}</p>
              <p className="text-sm text-muted">{detail}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function BetaSection({ visitor }: { visitor: SiteVisitor }) {
  const entry = siteEntry(visitor);
  return (
    <section id="beta" className="site-section" aria-labelledby="beta-title">
      <div className="mx-auto max-w-6xl px-4">
        <SectionHeading id="beta-title" kicker="Current access" title="The beta is open.">
          <p>The game is in beta. Player progression will be wiped after beta.</p>
          <p className="mt-3">
            Create an account and accept the terms. Then create one character and choose an open starting city. There is
            no invitation list.
          </p>
        </SectionHeading>
        <p className="mt-6 text-sm text-muted">
          <Link href="/legal" className="text-gold">
            Terms and privacy
          </Link>
        </p>
        <div className="mt-8">
          <PrimaryAction href={entry.href}>{entry.label}</PrimaryAction>
        </div>
      </div>
    </section>
  );
}

export function CommunitySection() {
  return (
    <section id="community" className="site-section" aria-labelledby="community-title">
      <div className="mx-auto max-w-6xl px-4">
        <SectionHeading id="community-title" kicker="Players" title="Gather inside the world.">
          <p>
            Organizations are how players gather, employ, and act together. A public Discord server is not linked on
            this site yet.
          </p>
        </SectionHeading>
      </div>
    </section>
  );
}
