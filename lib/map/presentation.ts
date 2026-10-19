export const CONFLICT_LAYER_NOTE =
  "Warfare and territorial conquest are not in this version. No conflict marks are drawn. A stored city contest stays in the inspector and does not recolor the country.";

export const CONSTITUTION_LAYER_NOTE =
  "Colors show the adopted game constitution template. They are not territorial control, party ownership, or a real-world government.";

const CONSTITUTION_COLORS: Record<string, string> = {
  parliamentary_republic: "#6e8ca8",
  presidential_republic: "#7d9a6e",
  semi_presidential: "#8e7ca8",
  constitutional_monarchy: "#a89868",
  federal_republic: "#6e9a96",
  one_party: "#a8846e",
  authoritarian: "#c4924a",
  dictatorship: "#8e6a6a",
};

const FALLBACK_COLORS = ["#6e8ca8", "#7d9a6e", "#8e7ca8", "#c4924a", "#6e9a96", "#a8846e"] as const;

export type ConstitutionMark = {
  iso2: string;
  templateId: string | null;
  templateName: string | null;
};

export type ConstitutionLegendEntry = {
  templateId: string;
  templateName: string;
  color: string;
};

export function constitutionColor(templateId: string): string {
  const known = CONSTITUTION_COLORS[templateId];
  if (known) return known;
  let hash = 0;
  for (const char of templateId.trim().toLowerCase()) hash = (hash * 33 + char.charCodeAt(0)) >>> 0;
  return FALLBACK_COLORS[hash % FALLBACK_COLORS.length] ?? FALLBACK_COLORS[0];
}

export function constitutionLegend(rows: ConstitutionMark[]): ConstitutionLegendEntry[] {
  const seen = new Map<string, ConstitutionLegendEntry>();
  for (const row of rows) {
    if (!row.templateId || !row.templateName) continue;
    if (seen.has(row.templateId)) continue;
    seen.set(row.templateId, {
      templateId: row.templateId,
      templateName: row.templateName,
      color: constitutionColor(row.templateId),
    });
  }
  return [...seen.values()].sort((left, right) => left.templateName.localeCompare(right.templateName));
}

export function countryTintChange(
  active: { resources: boolean; politics: boolean },
  next: { key: "resources" | "politics"; enabled: boolean },
): { resources: boolean; politics: boolean } {
  if (!next.enabled) return { ...active, [next.key]: false };
  if (next.key === "resources") return { resources: true, politics: false };
  return { resources: false, politics: true };
}
