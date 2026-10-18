const DIPLOMACY = /^A game diplomatic status was set to (friendly|neutral|strained|sanctioned)\.$/;

const FIXED: Record<string, { category: string; summary: string }> = {
  "election\nAn election was scheduled.": { category: "Election", summary: "An election was scheduled." },
  "result\nParliamentary seats were allocated from the recorded ballots.": {
    category: "Election",
    summary: "Parliamentary seats were allocated from the recorded ballots.",
  },
  "result\nThe election tied. No officeholder was installed.": {
    category: "Election",
    summary: "The election tied. No officeholder was installed.",
  },
  "result\nAn office was filled from the recorded ballots.": {
    category: "Election",
    summary: "An office was filled from the recorded ballots.",
  },
  "confidence\nThe executive lost a confidence vote and left office.": {
    category: "Election",
    summary: "The executive lost a confidence vote and left office.",
  },
  "confidence\nThe executive survived the confidence vote.": {
    category: "Election",
    summary: "The executive survived the confidence vote.",
  },
  "runoff\nNo candidate won a majority. A second round is open.": {
    category: "Election",
    summary: "No candidate won a majority. A second round is open.",
  },
  "government\nThe coalition formed the government.": { category: "Government", summary: "The coalition formed the government." },
  "government\nThe largest party formed the government.": {
    category: "Government",
    summary: "The largest party formed the government.",
  },
  "appointment\nA minister was appointed.": { category: "Government", summary: "A minister was appointed." },
  "claim\nA party leader claimed the vacant ruler office.": {
    category: "Government",
    summary: "A party leader claimed the vacant ruler office.",
  },
  "challenge\nA larger party replaced the ruler.": { category: "Government", summary: "A larger party replaced the ruler." },
  "emergency\nOpposition party formation was restricted by the game constitution.": {
    category: "Constitution",
    summary: "Opposition party formation was restricted by the game constitution.",
  },
  "coalition\nTwo parties signed a coalition agreement.": {
    category: "Diplomacy",
    summary: "Two parties signed a coalition agreement.",
  },
  "succession\nA party recorded a game succession. This is not a real monarch.": {
    category: "Government",
    summary: "A party recorded a game succession. This is not a real monarch.",
  },
};

export type PublicActivity = {
  id: string;
  category: string;
  summary: string;
  countryName: string;
  occurredAt: string;
};

export function publicActivityCopy(kind: string, detail: string): { category: string; summary: string } | null {
  if (kind === "diplomacy" && DIPLOMACY.test(detail)) return { category: "Diplomacy", summary: detail };
  return FIXED[`${kind}\n${detail}`] ?? null;
}

export function publicActivityItem(row: {
  id: unknown;
  kind: unknown;
  detail: unknown;
  countryName: unknown;
  occurredAt: unknown;
}): PublicActivity | null {
  if (typeof row.id !== "string" || typeof row.kind !== "string" || typeof row.detail !== "string") return null;
  if (typeof row.countryName !== "string" || row.countryName.length === 0) return null;
  const copy = publicActivityCopy(row.kind, row.detail);
  if (!copy) return null;
  const occurredAt = row.occurredAt instanceof Date ? row.occurredAt.toISOString() : row.occurredAt;
  if (typeof occurredAt !== "string" || Number.isNaN(new Date(occurredAt).getTime())) return null;
  return { id: row.id, category: copy.category, summary: copy.summary, countryName: row.countryName, occurredAt };
}
