import { describe, expect, it } from "vitest";
import { stackPracticeSkillXp, sumNodeBonus } from "@/lib/progression/nodes";
import {
  applySkillEffects,
  cooldownSeconds,
  levelForXp,
  populationAnswerMatches,
  practiceGains,
  skillBenefit,
  skillLevelForXp,
  textMentionsCity,
} from "@/lib/progression/rules";
import { marketFee, productionOperatingCost } from "@/lib/economy/service";

const bands = [
  { level: 1, xpRequired: 0 },
  { level: 2, xpRequired: 40 },
  { level: 3, xpRequired: 100 },
];

describe("progression rules", () => {
  it("accepts only the stored population", () => {
    expect(populationAnswerMatches("1,019,022", 1019022)).toBe(true);
    expect(populationAnswerMatches("1019023", 1019022)).toBe(false);
    expect(populationAnswerMatches("unreported", null)).toBe(true);
    expect(populationAnswerMatches("0", null)).toBe(false);
  });

  it("requires the city name in a long enough introduction", () => {
    expect(textMentionsCity("I arrived in Brussels looking for work.", "Brussels")).toBe(true);
    expect(textMentionsCity("I arrived in Gent looking for work.", "Brussels")).toBe(false);
    expect(textMentionsCity("Too short Brussels", "Brussels")).toBe(false);
  });

  it("derives level from the configured curve", () => {
    expect(levelForXp(0, bands)).toEqual({ level: 1, into: 0, span: 40 });
    expect(levelForXp(40, bands).level).toBe(2);
    expect(levelForXp(100, bands)).toEqual({ level: 3, into: 0, span: 0 });
  });

  it("applies skill effects from stored rates", () => {
    const rewarded = applySkillEffects(
      { xp: 50, currency: 100, reputation: 0 },
      [
        { effectKey: "mission_xp_percent", effectPerLevel: 2, level: 2 },
        { effectKey: "currency_percent", effectPerLevel: 2, level: 1 },
        { effectKey: "research_xp_flat", effectPerLevel: 5, level: 1 },
      ],
      "research",
    );
    expect(rewarded).toEqual({ xp: 57, currency: 102, reputation: 0 });
    const diplomacy = [{ effectKey: "reputation_flat", effectPerLevel: 1, level: 2 }];
    expect(applySkillEffects({ xp: 0, currency: 0, reputation: 0 }, diplomacy, "mission").reputation).toBe(2);
    expect(applySkillEffects({ xp: 0, currency: 0, reputation: 0 }, diplomacy, "introduction").reputation).toBe(2);
    expect(applySkillEffects({ xp: 0, currency: 0, reputation: 0 }, diplomacy, "research").reputation).toBe(0);
    expect(skillBenefit("reputation_flat", 1, 0)).toBe("Each level adds 1 reputation on mission and introduction rewards.");
  });

  it("floors practice cooldown at 15 seconds", () => {
    expect(cooldownSeconds(45, [{ effectKey: "cooldown_reduction_seconds", effectPerLevel: 5, level: 5 }])).toBe(20);
    expect(cooldownSeconds(45, [{ effectKey: "cooldown_reduction_seconds", effectPerLevel: 5, level: 8 }])).toBe(15);
    expect(practiceGains(10, 5, [{ effectKey: "practice_skill_xp", effectPerLevel: 1, level: 2 }])).toEqual({
      skillXp: 12,
      characterXp: 5,
    });
    expect(skillLevelForXp(40, 20, 5)).toBe(2);
  });

  it("caps focus bonuses and keeps production and market fees above zero", () => {
    const rows = [
      { effectValue: 1, effectCap: 1, effectSkillId: null },
      { effectValue: 1, effectCap: 1, effectSkillId: "networking" },
    ];
    expect(sumNodeBonus(rows, "practice_skill_xp", { kind: "general" })).toBe(1);
    expect(sumNodeBonus(rows, "practice_skill_xp", { kind: "skill", skillId: "networking" })).toBe(1);
    expect(stackPracticeSkillXp(1, 1)).toBe(2);
    expect(stackPracticeSkillXp(2, 2)).toBe(2);
    expect(productionOperatingCost(4, 1, 1, 1)).toBe(2);
    expect(productionOperatingCost(4, 5, 1, 1)).toBe(1);
    expect(marketFee(100, 2)).toBe(98);
    expect(marketFee(100, 200)).toBe(0);
  });
});
