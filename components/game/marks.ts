const TONES = ["gold", "info", "success", "warning"] as const;

export type MarkTone = (typeof TONES)[number];

export type MarkKind = "country" | "party" | "organization" | "item" | "mission" | "resource" | "business" | "currency";

export type Glyph =
  | "notebook"
  | "cargo"
  | "explore"
  | "social"
  | "business"
  | "politics"
  | "industry"
  | "plan"
  | "trade"
  | "generic"
  | "drop"
  | "flame"
  | "lump"
  | "rock"
  | "coil"
  | "ingot"
  | "crystal"
  | "cell"
  | "nugget"
  | "pellet"
  | "log"
  | "stalk"
  | "canister"
  | "sack"
  | "beam"
  | "plate"
  | "crate"
  | "locked"
  | "coin";

const GLYPHS: Record<string, Glyph> = {
  record: "notebook",
  cargo: "cargo",
  exploration: "explore",
  social: "social",
  business: "business",
  politics: "politics",
  industry: "industry",
  criminal: "plan",
  trade: "trade",
};

export function toneFor(seed: string): MarkTone {
  let hash = 0;
  for (const char of seed.trim().toUpperCase()) hash = (hash * 33 + char.charCodeAt(0)) >>> 0;
  return TONES[hash % TONES.length] ?? "gold";
}

export function glyphFor(category: string): Glyph {
  return GLYPHS[category.trim().toLowerCase()] ?? "generic";
}

const RESOURCE_GLYPHS: Record<string, Glyph> = {
  crude_oil: "drop",
  natural_gas: "flame",
  coal: "lump",
  iron_ore: "rock",
  copper: "coil",
  copper_ore: "coil",
  gold: "ingot",
  bauxite: "crystal",
  lithium: "cell",
  cobalt: "nugget",
  uranium: "pellet",
  timber: "log",
  wheat: "stalk",
  diesel: "canister",
  flour: "sack",
  steel: "beam",
  copper_cathode: "plate",
  consumer_goods: "crate",
  sealed_crate: "locked",
};

const ITEM_GLYPHS: Record<string, Glyph> = {
  field_notebook: "notebook",
  local_shipment: "cargo",
};

const BUSINESS_GLYPHS: Record<string, Glyph> = {
  trade: "trade",
  manufacturing: "industry",
  logistics: "cargo",
  agriculture: "stalk",
  mining: "rock",
  energy: "flame",
  construction: "business",
  finance: "coin",
  hospitality: "social",
};

export function resolveGlyph(kind: MarkKind, id?: string | null, category?: string | null): Glyph {
  const key = id?.trim().toLowerCase() ?? "";
  if (kind === "currency") return "coin";
  if (kind === "resource" && RESOURCE_GLYPHS[key]) return RESOURCE_GLYPHS[key];
  if (kind === "item" && ITEM_GLYPHS[key]) return ITEM_GLYPHS[key];
  if (kind === "business" && BUSINESS_GLYPHS[key]) return BUSINESS_GLYPHS[key];
  if (kind === "resource" || kind === "item" || kind === "mission" || kind === "business") return glyphFor(category || "");
  return "generic";
}

export function markCode(value: string, limit = 4): string {
  return value.trim().toUpperCase().slice(0, limit);
}

export function diplomacyClass(status: string): string {
  if (status === "friendly") return "text-success";
  if (status === "strained") return "text-warning";
  if (status === "sanctioned") return "text-danger";
  return "text-ink";
}
