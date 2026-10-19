"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { gameNav, groupSelected, mobileDock, navSelected, type NavGroup } from "@/lib/game/nav";

function GroupMenu({ group }: { group: NavGroup }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [box, setBox] = useState<{ top: number; left: number } | null>(null);
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = groupSelected(pathname, group.items);
  const only = group.items.length === 1 ? group.items[0] : null;

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    function onPointer(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  if (only) {
    const current = navSelected(pathname, only.href);
    return (
      <Link href={only.href} className={current ? "nav-link nav-link-active" : "nav-link"} aria-current={current ? "page" : undefined}>
        {group.label}
      </Link>
    );
  }

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        className={`nav-link bg-transparent ${selected ? "nav-link-active" : ""}`}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => {
          const anchor = rootRef.current?.getBoundingClientRect();
          if (anchor) setBox({ top: anchor.bottom + 4, left: anchor.left });
          setOpen((current) => !current);
        }}
      >
        {group.label}
      </button>
      {open ? (
        <div id={panelId} role="region" aria-label={group.label} className="fixed z-40 min-w-40 border border-line bg-panel p-1" style={box ?? undefined}>
          {group.items.map((item) => {
            const current = navSelected(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`block px-3 py-2 text-sm ${current ? "text-ink" : "text-muted"}`}
                aria-current={current ? "page" : undefined}
                onClick={() => setOpen(false)}
              >
                {item.label}
                {current ? <span className="ml-2 text-xs text-gold">Current</span> : null}
              </Link>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export function GameNav() {
  const pathname = usePathname();
  const home = navSelected(pathname, "/dashboard");
  return (
    <nav className="relative z-20 order-3 hidden min-w-0 basis-full flex-wrap items-center gap-1 px-0.5 py-1 text-sm md:flex" aria-label="Primary">
      <Link href="/dashboard" className={home ? "nav-link nav-link-active" : "nav-link"} aria-current={home ? "page" : undefined}>
        Home
      </Link>
      {gameNav.map((group) => (
        <GroupMenu key={group.id} group={group} />
      ))}
    </nav>
  );
}

export function MobileDock() {
  const pathname = usePathname();
  const [more, setMore] = useState(false);
  const panelId = useId();
  const covered = new Set(mobileDock.map((item) => item.href));
  const rest = gameNav.flatMap((group) => group.items).filter((item) => !covered.has(item.href));
  const moreCurrent = rest.some((item) => navSelected(pathname, item.href));

  useEffect(() => {
    if (!more) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setMore(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [more]);

  return (
    <>
      {more ? (
        <div id={panelId} role="region" aria-label="More destinations" className="fixed inset-x-2 bottom-16 z-30 max-h-[60vh] overflow-auto border border-line bg-panel p-2 md:hidden">
          {rest.map((item) => {
            const current = navSelected(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`block min-h-11 px-3 py-3 text-sm ${current ? "text-ink" : "text-muted"}`}
                aria-current={current ? "page" : undefined}
                onClick={() => setMore(false)}
              >
                {item.label}
                {current ? <span className="ml-2 text-xs text-gold">Current</span> : null}
              </Link>
            );
          })}
        </div>
      ) : null}
      <nav className="nav-scroll fixed inset-x-0 bottom-0 z-20 flex overflow-x-auto border-t border-line bg-panel md:hidden" aria-label="Mobile">
        {mobileDock.map((item) => {
          const current = navSelected(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`${current ? "nav-link nav-link-active" : "nav-link"} min-h-11 shrink-0 px-3 py-3 text-center text-xs`}
              aria-current={current ? "page" : undefined}
            >
              {item.label}
            </Link>
          );
        })}
        <button
          type="button"
          className={`nav-link min-h-11 bg-transparent px-3 py-3 text-xs ${moreCurrent || more ? "nav-link-active" : ""}`}
          aria-expanded={more}
          aria-controls={more ? panelId : undefined}
          onClick={() => setMore((current) => !current)}
        >
          More
        </button>
      </nav>
    </>
  );
}
