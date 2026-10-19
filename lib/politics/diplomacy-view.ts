export const DIPLOMATIC_STATUSES = ["sanctioned", "strained", "friendly", "neutral"] as const;

export type DiplomaticStatus = (typeof DIPLOMATIC_STATUSES)[number];

const LABELS: Record<string, string> = {
  sanctioned: "Sanctioned",
  strained: "Strained",
  friendly: "Friendly",
  neutral: "Neutral",
  signed: "Signed",
};

export function diplomacyLabel(status: string): string {
  return LABELS[status] ?? status;
}

export function diplomacyEffect(status: string): string {
  if (status === "sanctioned") {
    return "A sanction blocks travel between these countries, an underground market purchase across them, a delivery contract between them, and an organization city contest whose headquarters are in these countries.";
  }
  if (status === "friendly" || status === "neutral" || status === "strained") {
    return "This label is a game record. It does not change trade, travel, or offices.";
  }
  return "This stored status has no additional rule in the current game.";
}

export function groupRelations<T extends { status: string; name: string }>(relations: T[]): { status: string; rows: T[] }[] {
  const groups = new Map<string, T[]>();
  for (const relation of relations) {
    const rows = groups.get(relation.status) ?? [];
    rows.push(relation);
    groups.set(relation.status, rows);
  }
  const known = DIPLOMATIC_STATUSES.filter((status) => groups.has(status)).map((status) => ({ status, rows: groups.get(status) ?? [] }));
  const extra = [...groups.keys()]
    .filter((status) => !DIPLOMATIC_STATUSES.includes(status as DiplomaticStatus))
    .map((status) => ({ status, rows: groups.get(status) ?? [] }));
  return [...known, ...extra];
}

export function treatiesForCountry<T extends { iso2: string }>(treaties: T[], iso2: string): T[] {
  return treaties.filter((treaty) => treaty.iso2 === iso2);
}
