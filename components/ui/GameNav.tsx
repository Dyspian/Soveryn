"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function GameNav({
  items,
  label,
  variant = "bar",
}: {
  items: { href: string; label: string }[];
  label: string;
  variant?: "bar" | "dock";
}) {
  const pathname = usePathname();
  return (
    <nav className={variant === "dock" ? "nav-scroll fixed inset-x-0 bottom-0 z-20 flex overflow-x-auto border-t border-line bg-panel md:hidden" : "nav-scroll order-3 flex min-w-0 basis-full items-center gap-1 overflow-x-auto px-0.5 py-1 text-sm md:order-none md:basis-auto md:flex-1"} aria-label={label}>
      {items.map((item) => {
        const selected = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(`${item.href}/`));
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`${selected ? "nav-link nav-link-active" : "nav-link"} shrink-0 whitespace-nowrap ${variant === "dock" ? "px-3 py-3 text-center text-xs" : ""}`}
            aria-current={selected ? "page" : undefined}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
