export type SiteVisitor = {
  kind: "visitor" | "recruit" | "player";
};

export function siteVisitor(user: { characterId: string | null } | null): SiteVisitor {
  if (!user) return { kind: "visitor" };
  if (!user.characterId) return { kind: "recruit" };
  return { kind: "player" };
}

export function siteEntry(visitor: SiteVisitor): { href: string; label: string } {
  if (visitor.kind === "player") return { href: "/dashboard", label: "Open command center" };
  if (visitor.kind === "recruit") return { href: "/create", label: "Create your character" };
  return { href: "/register", label: "Join the beta" };
}
