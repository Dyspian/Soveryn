import Link from "next/link";
import { SectionHeading } from "@/components/site/SectionHeading";
import type { SiteVisitor } from "@/components/site/visitor";

export function WorldPreview({ visitor }: { visitor: SiteVisitor }) {
  const map = visitor.kind === "visitor" ? { href: "/login", label: "Sign in to open the map" } : { href: "/map", label: "Open the map" };
  return (
    <section id="world" className="site-section" aria-labelledby="world-title">
      <div className="mx-auto grid min-w-0 max-w-6xl items-center gap-10 px-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
        <div>
          <SectionHeading id="world-title" kicker="Real geography" title="The world is your arena.">
            <p>
              The playable map is imported geography, not a fictional continent. Place names come from GeoNames. Country
              boundaries come from Natural Earth. Tiles are OpenFreeMap. You choose an open starting city, and that city
              stays your recorded home when you travel.
            </p>
          </SectionHeading>
          <p className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <Link href={map.href} className="text-gold">
              {map.label}
            </Link>
            <a href="#play" className="text-gold">
              See how play works
            </a>
          </p>
        </div>
        <figure className="site-preview min-w-0">
          <img
            src="/website-background.jpg"
            alt="Site artwork showing a world map, a coastal city at dusk, and a figure on a ridge."
            className="site-preview-image"
            width="1600"
            height="1000"
            loading="lazy"
            decoding="async"
          />
          <figcaption className="site-preview-note">Site artwork. The playable map is a separate screen.</figcaption>
        </figure>
      </div>
    </section>
  );
}
