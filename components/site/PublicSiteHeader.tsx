"use client";

import Link from "next/link";
import { useEffect, useId, useState } from "react";
import { Emblem } from "@/components/brand/Emblem";
import { PrimaryAction } from "@/components/site/PrimaryAction";
import { siteSections } from "@/components/site/sections";
import { siteEntry, type SiteVisitor } from "@/components/site/visitor";

export function PublicSiteHeader({ visitor }: { visitor: SiteVisitor }) {
  const entry = siteEntry(visitor);
  const menuId = useId();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <header className="fixed inset-x-0 top-0 z-30 border-b border-line/80 bg-obsidian/80 backdrop-blur-sm">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:bg-panel focus:px-3 focus:py-2">
        Skip to content
      </a>
      <div className="mx-auto flex min-w-0 max-w-6xl items-center gap-3 px-4 py-3">
        <Link href="/" className="flex min-w-0 items-center gap-3" onClick={() => setOpen(false)}>
          <Emblem className="h-8 w-8 shrink-0 text-gold" />
          <span className="truncate font-serif text-lg tracking-[0.16em] text-ink sm:text-xl sm:tracking-[0.22em]">SOVERYN</span>
        </Link>
        <nav className="ml-4 hidden min-w-0 items-center gap-1 xl:flex" aria-label="Website">
          {siteSections.map((item) => (
            <a key={item.href} href={item.href} className="nav-link whitespace-nowrap">
              {item.label}
            </a>
          ))}
        </nav>
        <div className="ml-auto hidden shrink-0 items-center gap-2 xl:flex">
          {visitor.kind === "visitor" ? (
            <Link href="/login" className="nav-link">
              Sign in
            </Link>
          ) : (
            <Link href="/account" className="nav-link">
              Account
            </Link>
          )}
          <PrimaryAction href={entry.href}>{entry.label}</PrimaryAction>
        </div>
        <div className="ml-auto shrink-0 xl:hidden">
          <button
            type="button"
            className="btn btn-secondary min-h-11 px-3"
            aria-expanded={open}
            aria-controls={menuId}
            onClick={() => setOpen((current) => !current)}
          >
            {open ? "Close" : "Menu"}
          </button>
        </div>
      </div>
      {open ? (
        <nav id={menuId} className="border-t border-line bg-obsidian px-4 py-4 xl:hidden" aria-label="Website">
          <PrimaryAction href={entry.href} className="w-full">{entry.label}</PrimaryAction>
          <ul className="mt-4 space-y-1">
            {siteSections.map((item) => (
              <li key={item.href}>
                <a href={item.href} className="nav-link block min-h-11 py-2" onClick={() => setOpen(false)}>
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
          <div className="mt-2">
            {visitor.kind === "visitor" ? (
              <Link href="/login" className="nav-link inline-flex min-h-11 items-center py-2" onClick={() => setOpen(false)}>
                Sign in
              </Link>
            ) : (
              <Link href="/account" className="nav-link inline-flex min-h-11 items-center py-2" onClick={() => setOpen(false)}>
                Account
              </Link>
            )}
          </div>
        </nav>
      ) : null}
    </header>
  );
}
