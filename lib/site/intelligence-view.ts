export type WorldBulletin = {
  title: string;
  countryName: string | null;
  status: "scheduled" | "active" | "ended";
  outcome: "pending" | "met" | "unmet";
  endsAt: string;
};

export type WorldIntelligence = {
  calculatedAt: string;
  characters: number | null;
  politicalHomes: number | null;
  publicOrganizations: number | null;
  gameConstitutions: number | null;
  bulletins: WorldBulletin[] | null;
};

const STATUSES = new Set(["scheduled", "active", "ended"]);
const OUTCOMES = new Set(["pending", "met", "unmet"]);

export function countValue(value: unknown): number | null {
  const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  if (!Number.isInteger(number) || number < 0) return null;
  return number;
}

export function formatUtc(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown time";
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())} UTC`;
}

function bulletin(value: unknown): WorldBulletin | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const title = typeof row.title === "string" ? row.title : "";
  const status = typeof row.status === "string" ? row.status : "";
  const outcome = typeof row.outcome === "string" ? row.outcome : "";
  const endsAt = typeof row.endsAt === "string" ? row.endsAt : row.endsAt instanceof Date ? row.endsAt.toISOString() : "";
  const countryName = typeof row.countryName === "string" ? row.countryName : null;
  if (!title || !STATUSES.has(status) || !OUTCOMES.has(outcome) || !endsAt) return null;
  return { title, countryName, status: status as WorldBulletin["status"], outcome: outcome as WorldBulletin["outcome"], endsAt };
}

export function isWorldIntelligence(value: unknown): value is WorldIntelligence {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  if (typeof row.calculatedAt !== "string") return false;
  for (const key of ["characters", "politicalHomes", "publicOrganizations", "gameConstitutions"] as const) {
    if (row[key] !== null && countValue(row[key]) === null) return false;
  }
  if (row.bulletins !== null && !Array.isArray(row.bulletins)) return false;
  if (Array.isArray(row.bulletins) && row.bulletins.some((item) => bulletin(item) === null)) return false;
  return true;
}

export function readBulletin(value: unknown): WorldBulletin | null {
  return bulletin(value);
}
