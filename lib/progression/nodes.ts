export const NODE_EFFECT_CAPS: Record<string, number> = {
  practice_skill_xp: 2,
  practice_character_xp: 1,
  service_shift_flat: 2,
  production_cost_flat: 1,
  market_fee_flat: 4,
  shipment_cost_flat: 4,
  travel_cost_flat: 4,
  mission_xp_percent: 4,
  reputation_flat: 1,
};

export type NodeBonusRow = {
  effectValue: number;
  effectCap: number;
  effectSkillId: string | null;
};

export function sumNodeBonus(
  rows: NodeBonusRow[],
  effectKey: string,
  scope: { kind: "general" } | { kind: "skill"; skillId: string },
): number {
  const matched = rows.filter((row) =>
    scope.kind === "general" ? row.effectSkillId == null : row.effectSkillId === scope.skillId,
  );
  if (matched.length === 0) return 0;
  const sum = matched.reduce((total, row) => total + Math.max(0, row.effectValue), 0);
  const cap = Math.min(...matched.map((row) => Math.max(0, row.effectCap)));
  const hard = NODE_EFFECT_CAPS[effectKey] ?? cap;
  return Math.max(0, Math.min(sum, cap, hard));
}

export function stackPracticeSkillXp(general: number, matching: number): number {
  return Math.min(NODE_EFFECT_CAPS.practice_skill_xp ?? 2, Math.max(0, general) + Math.max(0, matching));
}

export type NodeGate = {
  id: string;
  name: string;
  branch: string;
  minLevel: number;
  skillId: string | null;
  skillLevel: number;
  requiresNode: string | null;
  requiresGroup: string | null;
  exclusiveGroup: string | null;
  cost: number;
};

export function nodeBlockReason(
  node: NodeGate,
  state: {
    specialization: string;
    level: number;
    skillPoints: number;
    skillLevels: Record<string, number>;
    ownedIds: Set<string>;
    ownedGroups: Set<string>;
    skillNames: Record<string, string>;
    nodeNames: Record<string, string>;
  },
): string | null {
  if (state.ownedIds.has(node.id)) return null;
  if (node.branch !== "shared" && node.branch !== state.specialization) {
    return "That focus is outside this specialization.";
  }
  if (node.exclusiveGroup && state.ownedGroups.has(node.exclusiveGroup)) {
    return "Another focus in this choice is already acquired.";
  }
  if (state.level < node.minLevel) return `Requires character level ${node.minLevel}.`;
  if (node.skillId && (state.skillLevels[node.skillId] ?? 0) < node.skillLevel) {
    const name = state.skillNames[node.skillId] ?? "The required skill";
    return `Requires ${name} level ${node.skillLevel}.`;
  }
  if (node.requiresNode && !state.ownedIds.has(node.requiresNode)) {
    return `Requires ${state.nodeNames[node.requiresNode] ?? "the previous focus"} first.`;
  }
  if (node.requiresGroup && !state.ownedGroups.has(node.requiresGroup)) {
    return "Choose a specialization focus first.";
  }
  if (state.skillPoints < node.cost) return "No skill points are available.";
  return null;
}
