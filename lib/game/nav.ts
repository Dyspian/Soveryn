export type NavItem = { href: string; label: string };

export type NavGroup = { id: string; label: string; items: NavItem[] };

export const gameNav: NavGroup[] = [
  { id: "world", label: "World", items: [{ href: "/map", label: "Map" }] },
  {
    id: "character",
    label: "Character",
    items: [
      { href: "/character", label: "Character" },
      { href: "/skills", label: "Skills" },
      { href: "/inventory", label: "Inventory" },
    ],
  },
  {
    id: "activities",
    label: "Activities",
    items: [
      { href: "/missions", label: "Missions" },
      { href: "/events", label: "Events" },
    ],
  },
  {
    id: "economy",
    label: "Economy",
    items: [
      { href: "/businesses", label: "Businesses" },
      { href: "/market", label: "Market" },
      { href: "/jobs", label: "Jobs" },
      { href: "/resources", label: "Resources" },
    ],
  },
  { id: "politics", label: "Politics", items: [{ href: "/politics", label: "Politics" }] },
  { id: "organizations", label: "Groups", items: [{ href: "/organizations", label: "Organizations" }] },
];

export const mobileDock: NavItem[] = [
  { href: "/dashboard", label: "Home" },
  { href: "/map", label: "Map" },
  { href: "/character", label: "Character" },
  { href: "/businesses", label: "Business" },
];

export function navSelected(pathname: string, href: string): boolean {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function groupSelected(pathname: string, items: NavItem[]): boolean {
  return items.some((item) => navSelected(pathname, item.href));
}
