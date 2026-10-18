import Link from "next/link";
import { siteSections } from "@/components/site/sections";
import type { SiteVisitor } from "@/components/site/visitor";

export function PublicSiteFooter({ visitor }: { visitor: SiteVisitor }) {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-10">
        <div className="flex flex-col justify-between gap-6 md:flex-row md:items-start">
          <p className="font-serif text-xl tracking-[0.22em] text-ink">SOVERYN</p>
          <nav className="flex flex-wrap gap-x-4 gap-y-2 text-sm" aria-label="Footer">
            {siteSections.map((item) => (
              <a key={item.href} href={item.href} className="nav-link">
                {item.label}
              </a>
            ))}
            <Link href="/legal" className="nav-link">
              Terms and privacy
            </Link>
            {visitor.kind === "visitor" ? (
              <Link href="/login" className="nav-link">
                Sign in
              </Link>
            ) : (
              <Link href="/account" className="nav-link">
                Account
              </Link>
            )}
          </nav>
        </div>
        <p className="max-w-3xl text-xs leading-5 text-muted">
          Place names and coordinates from GeoNames, licensed under CC BY 4.0. Country boundaries from Natural Earth
          (public domain). Map tiles by OpenFreeMap, using OpenStreetMap data. Imported oil and gas reserves are country
          totals from the Energy Institute Statistical Review of World Energy, via Our World in Data.
        </p>
      </div>
    </footer>
  );
}
