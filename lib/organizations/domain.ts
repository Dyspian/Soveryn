export class OrgError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OrgError";
  }
}

export const ORG_TYPES = {
  syndicate: { legal: false, label: "Syndicate" },
  street_gang: { legal: false, label: "Street gang" },
  smuggling_network: { legal: false, label: "Smuggling network" },
  mercenary_company: { legal: true, label: "Mercenary company" },
  private_security: { legal: true, label: "Private security firm" },
  trade_association: { legal: true, label: "Trade association" },
  political_action: { legal: true, label: "Political action organization" },
  corporate_group: { legal: true, label: "Corporate group" },
  underground_market: { legal: false, label: "Underground market network" },
} as const;

export type OrgType = keyof typeof ORG_TYPES;

export const PERMISSIONS = [
  "invite",
  "approve",
  "remove",
  "promote",
  "edit",
  "withdraw",
  "approve_spend",
  "start_operations",
  "locations",
  "treaties",
  "rivalries",
  "market",
  "reports",
  "settings",
  "dissolve",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const RANK_KEYS = ["founder", "leader", "deputy", "officer", "specialist", "member", "recruit"] as const;
export type RankKey = (typeof RANK_KEYS)[number];

type RankSeed = { key: RankKey; name: string; sort: number; permissions: Permission[] };

const ALL = [...PERMISSIONS];

export const RANK_SEEDS: RankSeed[] = [
  { key: "founder", name: "Founder", sort: 70, permissions: ALL },
  { key: "leader", name: "Leader", sort: 60, permissions: ALL },
  { key: "deputy", name: "Deputy", sort: 50, permissions: ["invite", "approve", "remove", "promote", "edit", "approve_spend", "start_operations", "locations", "treaties", "rivalries", "market", "reports"] },
  { key: "officer", name: "Officer", sort: 40, permissions: ["invite", "approve", "start_operations", "locations", "market", "reports"] },
  { key: "specialist", name: "Specialist", sort: 30, permissions: ["start_operations", "market"] },
  { key: "member", name: "Member", sort: 20, permissions: [] },
  { key: "recruit", name: "Recruit", sort: 10, permissions: [] },
];

export const OPERATIONS = {
  survey: { criminal: false, risk: "low", label: "Information survey", summary: "A fictional information-gathering contract resolved from preparation and character level." },
  protection: { criminal: false, risk: "low", label: "Protection contract", summary: "A fictional protection contract. It does not describe real security procedures." },
  recovery: { criminal: true, risk: "high", label: "Contested recovery", summary: "A fictional contested-goods contract. Success, heat, and losses are resolved by the server." },
  joint: { criminal: false, risk: "low", label: "Joint shift", summary: "Two organization members each record one company shift worked while this contract is open. The treasury receives the stake and margin once. Each recorded member receives 1 reputation once." },
} as const;

export type OperationKey = keyof typeof OPERATIONS;

export function isOrgType(value: string): value is OrgType {
  return value in ORG_TYPES;
}

export function isPermission(value: string): value is Permission {
  return (PERMISSIONS as readonly string[]).includes(value);
}

export function isRankKey(value: string): value is RankKey {
  return (RANK_KEYS as readonly string[]).includes(value);
}

export function isOperationKey(value: string): value is OperationKey {
  return value in OPERATIONS;
}

const BLOCKED_NAMES = ["admin", "moderator", "sovryn", "staff", "official"];

export function cleanName(value: string, label: string, min: number, max: number): string {
  const name = value.trim().replace(/\s+/g, " ");
  if (name.length < min || name.length > max) throw new OrgError(`Use a ${label} between ${min} and ${max} characters.`);
  if (!/^[A-Za-z0-9][A-Za-z0-9 '&-]*[A-Za-z0-9]$/.test(name) && name.length > 2) {
    throw new OrgError(`Use letters, numbers, spaces, apostrophes, or hyphens for the ${label}.`);
  }
  if (BLOCKED_NAMES.some((word) => name.toLowerCase().includes(word))) throw new OrgError("That name is reserved.");
  return name;
}

export function cleanTag(value: string): string {
  const tag = value.trim().toUpperCase();
  if (!/^[A-Z0-9]{2,5}$/.test(tag)) throw new OrgError("Use a tag of 2 to 5 letters or numbers.");
  if (BLOCKED_NAMES.some((word) => tag.toLowerCase().includes(word))) throw new OrgError("That tag is reserved.");
  return tag;
}

export function assertKey(value: string): void {
  if (!/^[0-9a-f-]{16,80}$/i.test(value)) throw new OrgError("Refresh the page and try that action again.");
}
