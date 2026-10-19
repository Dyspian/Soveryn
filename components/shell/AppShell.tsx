"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Emblem } from "@/components/brand/Emblem";
import { Portrait } from "@/components/brand/Portrait";
import { EntityMark } from "@/components/game/EntityMark";
import { PageFrame } from "@/components/shell/PageFrame";
import { NoticeBell } from "@/components/organizations/NoticeBoard";
import { GameNav, MobileDock } from "@/components/ui/GameNav";
import type { NoticeFeed } from "@/lib/organizations/notices";
import { acceptTermsAction, logoutAction } from "@/lib/actions/account";
import type { SessionUser } from "@/lib/auth/session";
import type { ShellStatus } from "@/lib/game/shell";

export function AppShell({
  user,
  shell = null,
  notices = null,
  children,
}: {
  user: SessionUser | null;
  shell?: ShellStatus | null;
  notices?: NoticeFeed | null;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  if (pathname === "/") return children;
  const map = pathname === "/map";
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
          {user?.characterId ? <GameNav /> : <div className="hidden md:block" />}
          <div className="order-2 ml-auto flex shrink-0 items-center gap-3 text-sm">
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
                {notices ? <NoticeBell feed={notices} /> : null}
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
        {shell ? <ShellHud shell={shell} username={user?.username ?? null} /> : null}
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
      {user?.characterId ? (
        <MobileDock />
      ) : (
        <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-panel md:hidden" aria-label="Mobile">
          <Link href="/map" className="nav-link inline-flex min-h-11 items-center px-3 py-3 text-xs">
            Map
          </Link>
        </nav>
      )}
    </div>
  );
}

function ShellHud({ shell, username }: { shell: ShellStatus; username: string | null }) {
  const width = shell.xpSpan > 0 ? Math.min(100, Math.round((shell.xpInto / shell.xpSpan) * 100)) : 0;
  return (
    <div className="shell-status nav-scroll">
      <Link href="/character" className="inline-flex min-w-0 shrink-0 items-center gap-2 text-ink">
        <Portrait portraitKey={shell.portraitKey} className="h-6 w-6" />
        <span>{username ? `@${username}` : "Character"}</span>
      </Link>
      <Link href="/character" className="shrink-0">
        Level <span className="num text-ink">{shell.level}</span>
        {shell.xpSpan > 0 ? <span className="num"> {shell.xpInto}/{shell.xpSpan}</span> : null}
      </Link>
      {shell.xpSpan > 0 ? (
        <span
          className="h-1.5 w-16 shrink-0 overflow-hidden bg-obsidian"
          role="progressbar"
          aria-valuenow={shell.xpInto}
          aria-valuemin={0}
          aria-valuemax={Math.max(shell.xpSpan, shell.xpInto)}
          aria-label={`Experience toward the next level, ${shell.xpInto} of ${shell.xpSpan}`}
        >
          <span className="block h-full bg-gold" style={{ width: `${width}%` }} />
        </span>
      ) : null}
      <Link href="/character" className="shrink-0">
        Currency <span className="num text-ink">{shell.currencyLabel}</span>
      </Link>
      <span className="inline-flex min-w-0 shrink-0 items-center gap-2">
        <EntityMark kind="country" code={shell.iso2} label={shell.countryName} size="sm" />
        <Link href="/map" className="max-w-40 truncate text-ink">
          {shell.cityName}
        </Link>
        <Link href={`/politics/${shell.iso2.toLowerCase()}`} className="max-w-40 truncate">
          {shell.countryName}
        </Link>
      </span>
      {shell.activeMission ? (
        <Link href="/missions" className="max-w-64 shrink-0 truncate text-ink">
          {shell.activeMission}
          {shell.activeMissionCount > 1 ? ` · ${shell.activeMissionCount} active` : ""}
        </Link>
      ) : null}
    </div>
  );
}
