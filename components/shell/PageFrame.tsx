"use client";

import { usePathname } from "next/navigation";

export function PageFrame({ children, footer }: { children: React.ReactNode; footer: React.ReactNode }) {
  const pathname = usePathname();
  const map = pathname === "/map";
  return (
    <>
      <div id="main" className={map ? "relative min-h-0 flex-1 overflow-hidden pb-14 md:pb-0" : "mx-auto w-full max-w-7xl px-4 py-6 pb-28 md:pb-6"}>{children}</div>
      {map ? null : footer}
    </>
  );
}
