export const SPECIALIZATIONS = [
  "entrepreneur",
  "politician",
  "industrialist",
  "trader",
  "criminal",
  "security",
  "explorer",
  "generalist",
] as const;

export type Specialization = (typeof SPECIALIZATIONS)[number];

export const SPECIALIZATION_DETAILS: Record<
  Specialization,
  { title: string; summary: string; skills: string[] }
> = {
  entrepreneur: {
    title: "Entrepreneur",
    summary: "Starts negotiation and finance. Daily work is an accounts review. Company shifts stay a separate labor contract.",
    skills: ["negotiation", "finance"],
  },
  politician: {
    title: "Politician",
    summary: "Starts diplomacy and public speaking. The daily contract is a civic practice note, not a vote.",
    skills: ["diplomacy", "public_speaking"],
  },
  industrialist: {
    title: "Industrialist",
    summary: "Starts production and logistics. The daily contract is one company shift, paid by the existing wage rules.",
    skills: ["production", "logistics"],
  },
  trader: {
    title: "Trader",
    summary: "Starts negotiation and logistics. The daily contract is negotiation practice, which raises currency rewards.",
    skills: ["negotiation", "logistics"],
  },
  criminal: {
    title: "Criminal",
    summary: "Starts operational planning and networking. The daily drill is fictional planning. It does not open a crime.",
    skills: ["operational_planning", "networking"],
  },
  security: {
    title: "Security specialist",
    summary: "Starts operational planning and diplomacy. The daily contract is a diplomacy note, not a protection contract.",
    skills: ["operational_planning", "diplomacy"],
  },
  explorer: {
    title: "Explorer",
    summary: "Starts networking and logistics. The daily contract is contact practice. A later focus can reduce journey cost or add networking practice experience.",
    skills: ["networking", "logistics"],
  },
  generalist: {
    title: "Generalist",
    summary: "Starts management and one skill point. The daily contract is a management review.",
    skills: ["management"],
  },
};

export const PRACTICE_ACTION_KEY = "practice:session";

export function skillBenefit(effectKey: string, effectPerLevel: number, level: number): string {
  const current = effectPerLevel * Math.max(0, level);
  if (effectKey === "mission_xp_percent") {
    return level > 0
      ? `Mission experience is ${current}% higher. Practice experience is unchanged.`
      : `Each level adds ${effectPerLevel}% to mission experience. Practice experience is unchanged.`;
  }
  if (effectKey === "currency_percent") {
    return level > 0
      ? `Currency rewards are ${current}% higher.`
      : `Each level adds ${effectPerLevel}% to currency rewards.`;
  }
  if (effectKey === "practice_skill_xp") {
    return level > 0
      ? `Practice grants ${current} extra skill experience.`
      : `Each level adds ${effectPerLevel} skill experience when practicing.`;
  }
  if (effectKey === "reputation_flat") {
    return level > 0
      ? `Mission and introduction rewards add ${current} reputation.`
      : `Each level adds ${effectPerLevel} reputation on mission and introduction rewards.`;
  }
  if (effectKey === "practice_character_xp") {
    return level > 0
      ? `Practice grants ${current} extra character experience.`
      : `Each level adds ${effectPerLevel} character experience when practicing.`;
  }
  if (effectKey === "delivery_currency_flat") {
    return level > 0
      ? `Delivery rewards add ${current} currency.`
      : `Each level adds ${effectPerLevel} currency on delivery rewards.`;
  }
  if (effectKey === "cooldown_reduction_seconds") {
    return level > 0
      ? `The daily practice wait is ${current} seconds shorter. It does not open a second session.`
      : `Each level shortens the daily practice wait by ${effectPerLevel} seconds, and never below 15 seconds.`;
  }
  if (effectKey === "introduction_xp_flat") {
    return level > 0
      ? `Introduction rewards add ${current} experience.`
      : `Each level adds ${effectPerLevel} experience on introduction rewards.`;
  }
  if (effectKey === "research_xp_flat") {
    return level > 0
      ? `City-research rewards add ${current} experience.`
      : `Each level adds ${effectPerLevel} experience on city-research rewards.`;
  }
  return "This skill has no active effect.";
}

export type SkillEffect = {
  effectKey: string;
  effectPerLevel: number;
  level: number;
};

export type LevelBand = {
  level: number;
  xpRequired: number;
};

export type Reward = {
  xp: number;
  currency: number;
  reputation: number;
};

export function populationAnswerMatches(submitted: string, population: number | null): boolean {
  const trimmed = submitted.trim().replace(/[, ]/g, "");
  if (population == null) return trimmed.toLowerCase() === "unreported";
  return /^[0-9]+$/.test(trimmed) && Number(trimmed) === population;
}

export function textMentionsCity(text: string, cityName: string): boolean {
  const body = text.trim();
  if (body.length < 20 || body.length > 400) return false;
  return body.toLowerCase().includes(cityName.trim().toLowerCase());
}

export function levelForXp(xp: number, bands: LevelBand[]): { level: number; into: number; span: number } {
  const sorted = [...bands].sort((a, b) => a.level - b.level);
  let level = sorted[0]?.level ?? 1;
  for (const band of sorted) {
    if (xp >= band.xpRequired) level = band.level;
  }
  const current = sorted.find((band) => band.level === level);
  const next = sorted.find((band) => band.level === level + 1);
  const floor = current?.xpRequired ?? 0;
  if (!next) return { level, into: xp - floor, span: 0 };
  return { level, into: xp - floor, span: next.xpRequired - floor };
}

export function skillLevelForXp(xp: number, xpPerLevel: number, maxLevel: number): number {
  if (xpPerLevel <= 0) return 0;
  return Math.min(maxLevel, Math.floor(xp / xpPerLevel));
}

export function skillProgress(xp: number, level: number, xpPerLevel: number, maxLevel: number): { into: number; span: number } {
  if (level >= maxLevel || xpPerLevel <= 0) return { into: Math.max(0, xp), span: 0 };
  return { into: Math.max(0, xp - level * xpPerLevel), span: xpPerLevel };
}

export function applySkillEffects(base: Reward, skills: SkillEffect[], context: string): Reward {
  let xp = base.xp;
  let currency = base.currency;
  let reputation = base.reputation;
  for (const skill of skills) {
    if (skill.level <= 0) continue;
    const amount = skill.effectPerLevel * skill.level;
    if (skill.effectKey === "mission_xp_percent" && context !== "practice") {
      xp += Math.floor((base.xp * amount) / 100);
    }
    if (skill.effectKey === "currency_percent") currency += Math.floor((base.currency * amount) / 100);
    if (skill.effectKey === "reputation_flat" && (context === "introduction" || context === "mission")) reputation += amount;
    if (skill.effectKey === "delivery_currency_flat" && context === "delivery") currency += amount;
    if (skill.effectKey === "introduction_xp_flat" && context === "introduction") xp += amount;
    if (skill.effectKey === "research_xp_flat" && context === "research") xp += amount;
  }
  return { xp, currency, reputation };
}

export function practiceGains(baseSkillXp: number, baseCharacterXp: number, skills: SkillEffect[]): { skillXp: number; characterXp: number } {
  const finance = skills.find((skill) => skill.effectKey === "practice_skill_xp");
  const speaking = skills.find((skill) => skill.effectKey === "practice_character_xp");
  return {
    skillXp: baseSkillXp + (finance ? finance.effectPerLevel * finance.level : 0),
    characterXp: baseCharacterXp + (speaking ? speaking.effectPerLevel * speaking.level : 0),
  };
}

export function cooldownSeconds(baseSeconds: number, skills: SkillEffect[]): number {
  const production = skills.find((skill) => skill.effectKey === "cooldown_reduction_seconds");
  const reduced = baseSeconds - (production ? production.effectPerLevel * production.level : 0);
  return Math.max(15, reduced);
}
