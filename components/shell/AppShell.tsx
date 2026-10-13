"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Emblem } from "@/components/brand/Emblem";
import { PageFrame } from "@/components/shell/PageFrame";
import { GameNav } from "@/components/ui/GameNav";
import { acceptTermsAction, logoutAction } from "@/lib/actions/account";
import type { SessionUser } from "@/lib/auth/session";

const live = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/map", label: "World" },
  { href: "/character", label: "Character" },
  { href: "/skills", label: "Skills" },
  { href: "/missions", label: "Missions" },
  { href: "/events", label: "Events" },
  { href: "/businesses", label: "Businesses" },
  { href: "/market", label: "Market" },
  { href: "/jobs", label: "Jobs" },
  { href: "/politics", label: "Politics" },
  { href: "/organizations", label: "Organizations" },
];

export function AppShell({
  user,
  children,
}: {
  user: SessionUser | null;
  children: React.ReactNode;
}) {
  const map = usePathname() === "/map";
  return (
    <div className={map ? "flex h-dvh flex-col overflow-hidden" : "flex min-h-dvh flex-col"}>
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:bg-panel focus:px-3 focus:py-2">
        Skip to content
      </a>
      <header className="command-bar shrink-0">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-2">
          <Link href={user?.characterId ? "/dashboard" : "/"} className="order-1 flex shrink-0 items-center gap-3">
            <Emblem className="h-8 w-8 text-gold" />
            <span className="font-serif text-xl tracking-[0.22em] text-ink">SOVERYN</span>
          </Link>
          {user?.characterId ? <GameNav items={live} label="Primary" /> : <div className="hidden md:block" />}
          <div className="order-2 flex shrink-0 items-center gap-3 text-sm md:order-3">
            {user?.role === "admin" ? (
              <>
                <Link href="/admin/starting-locations" className="nav-link hidden xl:inline">
                  Cities
                </Link>
                <Link href="/admin/world" className="nav-link hidden lg:inline">
                  Tick
                </Link>
              </>
            ) : null}
            {user ? (
              <>
                {user.username ? (
                  <Link href="/character" className="nav-link hidden sm:inline">
                    @{user.username}
                  </Link>
                ) : null}
                <Link href="/account" className="nav-link">
                  Account
                </Link>
                <form action={logoutAction}>
                  <button className="btn btn-secondary" type="submit">
                    Sign out
                  </button>
                </form>
              </>
            ) : (
              <Link href="/login" className="btn btn-secondary">
                Sign in
              </Link>
            )}
          </div>
        </div>
      </header>
      {user && !user.termsAccepted ? (
        <form action={acceptTermsAction} className="border-b border-line bg-panel">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
            <p>
              Accept the <Link href="/legal" className="text-gold">terms and privacy notice</Link> before continuing.
            </p>
            <button className="btn btn-primary">Accept</button>
          </div>
        </form>
      ) : null}
      <div className="flex min-h-0 flex-1 flex-col">
      <PageFrame
        footer={
          <footer className="mx-auto max-w-7xl px-4 pt-8 pb-24 text-xs leading-5 text-muted md:pb-8">
            Place names and coordinates from GeoNames, licensed under CC BY 4.0. Country boundaries from Natural Earth
            (public domain). Map tiles by OpenFreeMap, using OpenStreetMap data. Imported oil and gas reserves are country
            totals from the Energy Institute Statistical Review of World Energy, via Our World in Data.{" "}
            <Link href="/legal" className="text-gold">
              Terms and privacy
            </Link>
          </footer>
        }
      >
        {children}
      </PageFrame>
      </div>
      <GameNav
        variant="dock"
        label="Mobile"
        items={
          user?.characterId
            ? [
                { href: "/dashboard", label: "Home" },
                { href: "/map", label: "Map" },
                { href: "/character", label: "Character" },
                { href: "/businesses", label: "Business" },
              ]
            : [{ href: "/map", label: "Map" }]
        }
      />
    </div>
  );
}
