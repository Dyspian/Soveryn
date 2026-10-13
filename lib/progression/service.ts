import type { Sql } from "@/lib/db";
import {
  applySkillEffects,
  cooldownSeconds,
  levelForXp,
  populationAnswerMatches,
  PRACTICE_ACTION_KEY,
  practiceGains,
  skillBenefit,
  skillLevelForXp,
  SPECIALIZATION_DETAILS,
  textMentionsCity,
  type LevelBand,
  type Reward,
  type SkillEffect,
  type Specialization,
} from "@/lib/progression/rules";
import { nodeBlockReason, stackPracticeSkillXp, sumNodeBonus, type NodeBonusRow } from "@/lib/progression/nodes";
import { BULLETIN_MISSION_ID } from "@/lib/world/bulletin";
import { formatUtc } from "@/lib/world/clock";

export class ProgressionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProgressionError";
  }
}

type SkillRow = {
  id: string;
  category: string;
  name: string;
  description: string;
  max_level: number;
  xp_per_level: number;
  effect_key: string;
  effect_per_level: number;
  level: number;
  xp: number;
  practiceAvailableAt: string | Date | null;
};

async function ruleAmount(sql: Sql, key: string, fallback: number): Promise<number> {
  const rows = await sql.query<{ amount: number | string }>("select amount from game_rules where key = $1", [key]);
  return rows[0] ? Number(rows[0].amount) : fallback;
}

async function levelBands(sql: Sql): Promise<LevelBand[]> {
  const rows = await sql.query<{ level: number; xp_required: number }>(
    "select level, xp_required from level_bands order by level",
  );
  return rows.map((row) => ({ level: Number(row.level), xpRequired: Number(row.xp_required) }));
}

async function lockCharacter(sql: Sql, userId: string): Promise<{ id: string; specialization: Specialization; country_id: string }> {
  const rows = await sql.query<{ id: string; specialization: Specialization; country_id: string }>(
    "select id, specialization, country_id from characters where user_id = $1 for update",
    [userId],
  );
  const row = rows[0];
  if (!row) throw new ProgressionError("Create a character before using this action.");
  return row;
}

async function skillEffects(sql: Sql, characterId: string): Promise<SkillEffect[]> {
  const rows = await sql.query<{ effect_key: string; effect_per_level: number; level: number }>(
    `select d.effect_key, d.effect_per_level, cs.level
     from character_skills cs
     join skill_definitions d on d.id = cs.skill_id
     where cs.character_id = $1`,
    [characterId],
  );
  return rows.map((row) => ({
    effectKey: row.effect_key,
    effectPerLevel: Number(row.effect_per_level),
    level: Number(row.level),
  }));
}

export async function nodeBonus(
  sql: Sql,
  characterId: string,
  effectKey: string,
  scope: { kind: "general" } | { kind: "skill"; skillId: string },
): Promise<number> {
  const rows = await sql.query<{ effect_value: number; effect_cap: number; effect_skill_id: string | null }>(
    `select n.effect_value, n.effect_cap, n.effect_skill_id
     from character_skill_nodes owned
     join skill_nodes n on n.id = owned.node_id
     where owned.character_id = $1 and n.effect_key = $2`,
    [characterId, effectKey],
  );
  return sumNodeBonus(
    rows.map((row) => ({
      effectValue: Number(row.effect_value),
      effectCap: Number(row.effect_cap),
      effectSkillId: row.effect_skill_id,
    })),
    effectKey,
    scope,
  );
}

async function practiceFocusXp(sql: Sql, characterId: string, skillId: string): Promise<number> {
  const rows = await sql.query<NodeBonusRow & { effect_value: number; effect_cap: number; effect_skill_id: string | null }>(
    `select n.effect_value, n.effect_cap, n.effect_skill_id
     from character_skill_nodes owned
     join skill_nodes n on n.id = owned.node_id
     where owned.character_id = $1 and n.effect_key = 'practice_skill_xp'`,
    [characterId],
  );
  const mapped = rows.map((row) => ({
    effectValue: Number(row.effect_value),
    effectCap: Number(row.effect_cap),
    effectSkillId: row.effect_skill_id,
  }));
  return stackPracticeSkillXp(
    sumNodeBonus(mapped, "practice_skill_xp", { kind: "general" }),
    sumNodeBonus(mapped, "practice_skill_xp", { kind: "skill", skillId }),
  );
}

async function grantXp(sql: Sql, characterId: string, reward: Reward, sourceKey: string, kind: string, detail: string): Promise<boolean> {
  const inserted = await sql.query<{ id: string }>(
    `insert into progression_events (character_id, kind, source_key, xp_awarded, currency_awarded, reputation_awarded, detail)
     values ($1, $2, $3, $4, $5, $6, $7)
     on conflict (character_id, source_key) do nothing
     returning id`,
    [characterId, kind, sourceKey, reward.xp, reward.currency, reward.reputation, detail],
  );
  if (!inserted[0]) return false;

  const current = await sql.query<{ xp: number; level: number }>(
    "select xp, level from characters where id = $1",
    [characterId],
  );
  const previousXp = Number(current[0]?.xp ?? 0);
  const previousLevel = Number(current[0]?.level ?? 1);
  const nextXp = previousXp + reward.xp;
  const bands = await levelBands(sql);
  const nextLevel = levelForXp(nextXp, bands).level;
  const points = Math.max(0, nextLevel - previousLevel);
  await sql.query(
    `update characters
     set xp = $2, level = $3, skill_points = skill_points + $4,
         currency = currency + $5, reputation = reputation + $6
     where id = $1`,
    [characterId, nextXp, nextLevel, points, reward.currency, reward.reputation],
  );
  if (points > 0) {
    await sql.query(
      `insert into progression_events (character_id, kind, source_key, xp_awarded, currency_awarded, detail)
       values ($1, 'level_up', $2, 0, 0, $3)`,
      [characterId, `${sourceKey}:level`, `Reached level ${nextLevel}.`],
    );
    await syncTrackedObjectives(sql, characterId);
  }
  return true;
}

async function refreshMission(sql: Sql, characterId: string, missionId: string): Promise<void> {
  const open = await sql.query<{ remaining: number }>(
    `select count(*)::int as remaining
     from character_objectives co
     join mission_objectives o on o.id = co.objective_id
     where co.character_id = $1 and o.mission_id = $2 and co.completed = false`,
    [characterId, missionId],
  );
  if (Number(open[0]?.remaining ?? 1) > 0) return;

  const claimed = await sql.query<{ status: string }>(
    "select status from character_missions where character_id = $1 and mission_id = $2 for update",
    [characterId, missionId],
  );
  if (claimed[0]?.status !== "active") return;

  const mission = await sql.query<{
    xp_reward: number;
    currency_reward: number;
    reputation_reward: number;
    reward_context: string;
    name: string;
  }>("select xp_reward, currency_reward, reputation_reward, reward_context, name from missions where id = $1", [missionId]);
  const row = mission[0];
  if (!row) return;
  const baseReward = {
    xp: Number(row.xp_reward),
    currency: Number(row.currency_reward),
    reputation: Number(row.reputation_reward),
  };
  const reward = applySkillEffects(baseReward, await skillEffects(sql, characterId), row.reward_context);
  reward.xp += Math.floor((baseReward.xp * (await nodeBonus(sql, characterId, "mission_xp_percent", { kind: "general" }))) / 100);
  if (row.reward_context === "introduction" || row.reward_context === "mission") {
    reward.reputation += await nodeBonus(sql, characterId, "reputation_flat", { kind: "general" });
  }
  const claimedRow = await sql.query<{ repeatable: boolean; cooldown_seconds: number; completions: number }>(
    `select m.repeatable, m.cooldown_seconds, cm.completions
     from missions m
     join character_missions cm on cm.mission_id = m.id and cm.character_id = $2
     where m.id = $1`,
    [missionId, characterId],
  );
  const completion = Number(claimedRow[0]?.completions ?? 0);
  const repeatable = Boolean(claimedRow[0]?.repeatable);
  const sourceKey = repeatable ? `mission:${missionId}:${completion + 1}` : `mission:${missionId}`;
  const paid = await grantXp(sql, characterId, reward, sourceKey, "mission", `Completed ${row.name}.`);
  if (!paid) return;
  await sql.query(
    `update character_missions
     set status = 'completed',
         completed_at = now(),
         completions = completions + 1,
         available_at = case when $3::boolean then now() + ($4 * interval '1 second') else available_at end
     where character_id = $1 and mission_id = $2 and status = 'active'`,
    [characterId, missionId, repeatable, Number(claimedRow[0]?.cooldown_seconds ?? 0)],
  );
  const { recordCivicTerm } = await import("@/lib/progression/terms");
  await recordCivicTerm(sql, characterId);
}

export async function provisionNewCharacter(
  sql: Sql,
  input: {
    userId: string;
    username: string;
    displayName: string | null;
    biography: string | null;
    portraitKey: string;
    countryId: string;
    placeId: string;
    specialization: Specialization;
  },
): Promise<string> {
  const existing = await sql.query<{ id: string }>("select id from characters where user_id = $1", [input.userId]);
  if (existing[0]) throw new ProgressionError("This account already has a character.");

  const currency = await ruleAmount(sql, "starting_currency", 100);
  const created = await sql.query<{ id: string }>(
    `insert into characters (
       user_id, username, display_name, biography, portrait_key, country_id, place_id,
       specialization, currency, skill_points
     ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     returning id`,
    [
      input.userId,
      input.username,
      input.displayName,
      input.biography,
      input.portraitKey,
      input.countryId,
      input.placeId,
      input.specialization,
      currency,
      input.specialization === "generalist" ? 1 : 0,
    ],
  );
  const characterId = created[0]?.id;
  if (!characterId) throw new ProgressionError("The character could not be created.");

  const skills = await sql.query<{ id: string; xp_per_level: number }>("select id, xp_per_level from skill_definitions");
  const granted = new Set(SPECIALIZATION_DETAILS[input.specialization].skills);
  for (const skill of skills) {
    const starts = granted.has(skill.id);
    await sql.query(
      `insert into character_skills (character_id, skill_id, level, xp) values ($1, $2, $3, $4)`,
      [characterId, skill.id, starts ? 1 : 0, starts ? Number(skill.xp_per_level) : 0],
    );
  }

  await sql.query(
    `insert into inventory_entries (character_id, item_id, quantity) values ($1, 'field_notebook', 1)`,
    [characterId],
  );
  await sql.query(
    `insert into inventory_events (character_id, item_id, delta, reason, source_key)
     values ($1, 'field_notebook', 1, 'starting kit', 'grant:field_notebook')`,
    [characterId],
  );
  await sql.query(
    `insert into audit_events (actor_user_id, action, entity_type, entity_id, payload)
     values ($1, 'character.create', 'character', $2, $3::jsonb)`,
    [input.userId, characterId, JSON.stringify({ specialization: input.specialization, placeId: input.placeId })],
  );
  return characterId;
}

async function syncTrackedObjectives(sql: Sql, characterId: string): Promise<void> {
  await sql.query(
    `update character_objectives co
     set progress = least(cs.level, o.quantity),
         completed = cs.level >= o.quantity
     from mission_objectives o
     join character_missions cm on cm.mission_id = o.mission_id
     join character_skills cs on cs.skill_id = o.skill_id
     where co.objective_id = o.id
       and cm.character_id = co.character_id
       and cs.character_id = co.character_id
       and co.character_id = $1
       and cm.status = 'active'
       and o.kind = 'skill_level'
       and co.completed = false`,
    [characterId],
  );
  await sql.query(
    `update character_objectives co
     set progress = least(c.level, o.quantity),
         completed = c.level >= o.quantity
     from mission_objectives o
     join character_missions cm on cm.mission_id = o.mission_id
     join characters c on c.id = cm.character_id
     where co.objective_id = o.id
       and cm.character_id = co.character_id
       and co.character_id = $1
       and cm.status = 'active'
       and o.kind = 'level_reached'
       and co.completed = false`,
    [characterId],
  );
  const missions = await sql.query<{ mission_id: string }>(
    `select distinct o.mission_id
     from mission_objectives o
     join character_missions cm on cm.mission_id = o.mission_id
     where cm.character_id = $1 and cm.status = 'active' and o.kind in ('skill_level', 'level_reached')`,
    [characterId],
  );
  for (const mission of missions) await refreshMission(sql, characterId, mission.mission_id);
}

export async function recordWorkShift(sql: Sql, userId: string): Promise<void> {
  const character = await lockCharacter(sql, userId);
  const updated = await sql.query<{ mission_id: string }>(
    `update character_objectives co
     set progress = co.progress + 1,
         completed = (co.progress + 1) >= o.quantity
     from mission_objectives o
     join character_missions cm on cm.mission_id = o.mission_id
     where co.objective_id = o.id
       and cm.character_id = co.character_id
       and co.character_id = $1
       and cm.status = 'active'
       and o.kind = 'work_shift'
       and co.completed = false
     returning o.mission_id`,
    [character.id],
  );
  const missionIds = [...new Set(updated.map((row) => row.mission_id))];
  for (const missionId of missionIds) await refreshMission(sql, character.id, missionId);
}

export async function recordEconomyProgress(
  sql: Sql,
  characterId: string,
  kind: "market_sold" | "shipment_delivered" | "production_finished" | "journey_arrived",
): Promise<void> {
  const updated = await sql.query<{ mission_id: string }>(
    `update character_objectives co
     set progress = co.progress + 1,
         completed = (co.progress + 1) >= o.quantity
     from mission_objectives o
     join character_missions cm on cm.mission_id = o.mission_id
     where co.objective_id = o.id
       and cm.character_id = co.character_id
       and co.character_id = $1
       and cm.status = 'active'
       and o.kind = $2
       and co.completed = false
     returning o.mission_id`,
    [characterId, kind],
  );
  const missionIds = [...new Set(updated.map((row) => row.mission_id))];
  for (const missionId of missionIds) await refreshMission(sql, characterId, missionId);
}

export async function practiceSkill(sql: Sql, userId: string, skillId: string): Promise<string> {
  const character = await lockCharacter(sql, userId);
  const definition = await sql.query<{ name: string; max_level: number; xp_per_level: number }>(
    "select name, max_level, xp_per_level from skill_definitions where id = $1",
    [skillId],
  );
  const skill = definition[0];
  if (!skill) throw new ProgressionError("That skill is not in the catalog.");

  const effects = await skillEffects(sql, character.id);
  const wait = cooldownSeconds(await ruleAmount(sql, "practice_cooldown_seconds", 86400), effects);
  const cooling = await sql.query<{ available_at: string | Date }>(
    "select available_at from action_cooldowns where character_id = $1 and action_key = $2 for update",
    [character.id, PRACTICE_ACTION_KEY],
  );
  if (cooling[0] && new Date(cooling[0].available_at).getTime() > Date.now()) {
    throw new ProgressionError(`Practice is on cooldown until ${formatUtc(cooling[0].available_at)}.`);
  }

  const owned = await sql.query<{ xp: number }>(
    "select xp from character_skills where character_id = $1 and skill_id = $2 for update",
    [character.id, skillId],
  );
  if (!owned[0]) throw new ProgressionError("That skill is not on this character.");
  const scheduled = await sql.query<{ available_at: string | Date }>(
    `insert into action_cooldowns (character_id, action_key, available_at)
     values ($1, $2, now() + ($3 * interval '1 second'))
     on conflict (character_id, action_key) do update set available_at = excluded.available_at
     where action_cooldowns.available_at <= now()
     returning available_at`,
    [character.id, PRACTICE_ACTION_KEY, wait],
  );
  const nextAt = scheduled[0]?.available_at;
  if (!nextAt) {
    const held = cooling[0] ?? (await sql.query<{ available_at: string | Date }>(
      "select available_at from action_cooldowns where character_id = $1 and action_key = $2",
      [character.id, PRACTICE_ACTION_KEY],
    ))[0];
    throw new ProgressionError(held ? `Practice is on cooldown until ${formatUtc(held.available_at)}.` : "Practice is on cooldown.");
  }
  const gains = practiceGains(
    await ruleAmount(sql, "practice_skill_xp", 10),
    await ruleAmount(sql, "practice_character_xp", 5),
    effects,
  );
  const focusSkillXp = await practiceFocusXp(sql, character.id, skillId);
  const focusCharacterXp = await nodeBonus(sql, character.id, "practice_character_xp", { kind: "skill", skillId });
  gains.skillXp += focusSkillXp;
  gains.characterXp += focusCharacterXp;
  const nextSkillXp = Number(owned[0].xp) + gains.skillXp;
  const nextSkillLevel = skillLevelForXp(nextSkillXp, Number(skill.xp_per_level), Number(skill.max_level));
  await sql.query("update character_skills set xp = $3, level = $4 where character_id = $1 and skill_id = $2", [
    character.id,
    skillId,
    nextSkillXp,
    nextSkillLevel,
  ]);
  const practiceKey = `practice:${PRACTICE_ACTION_KEY}:${new Date(nextAt).toISOString()}`;
  await grantXp(
    sql,
    character.id,
    { xp: gains.characterXp, currency: 0, reputation: 0 },
    practiceKey,
    "practice",
    `Practiced ${skill.name}.`,
  );
  await sql.query(
    `update character_objectives co
     set progress = 1, completed = true
     from mission_objectives o
     join character_missions cm on cm.mission_id = o.mission_id
     where co.objective_id = o.id
       and cm.character_id = co.character_id
       and co.character_id = $1
       and cm.status = 'active'
       and o.kind = 'skill_practiced'
       and o.skill_id = $2
       and co.completed = false`,
    [character.id, skillId],
  );
  const missions = await sql.query<{ mission_id: string }>(
    `select distinct o.mission_id
     from mission_objectives o
     join character_missions cm on cm.mission_id = o.mission_id
     where cm.character_id = $1 and cm.status = 'active' and o.kind = 'skill_practiced' and o.skill_id = $2`,
    [character.id, skillId],
  );
  for (const mission of missions) await refreshMission(sql, character.id, mission.mission_id);
  await syncTrackedObjectives(sql, character.id);
  const focusNote = focusSkillXp > 0 ? ` A focus added ${focusSkillXp} skill experience.` : "";
  return `Practiced ${skill.name}.${focusNote} The next session is available after ${formatUtc(nextAt)}.`;
}

export async function spendSkillPoint(sql: Sql, userId: string, skillId: string): Promise<string> {
  const character = await lockCharacter(sql, userId);
  const skill = await sql.query<{ name: string; max_level: number; xp_per_level: number; xp: number; skill_points: number }>(
    `select d.name, d.max_level, d.xp_per_level, cs.xp, c.skill_points
     from character_skills cs
     join skill_definitions d on d.id = cs.skill_id
     join characters c on c.id = cs.character_id
     where cs.character_id = $1 and cs.skill_id = $2
     for update`,
    [character.id, skillId],
  );
  const row = skill[0];
  if (!row) throw new ProgressionError("That skill is not on this character.");
  if (Number(row.skill_points) < 1) throw new ProgressionError("No skill points are available.");
  const level = skillLevelForXp(Number(row.xp), Number(row.xp_per_level), Number(row.max_level));
  if (level >= Number(row.max_level)) throw new ProgressionError("That skill is already at its maximum.");
  const spent = await sql.query<{ skill_points: number }>(
    "update characters set skill_points = skill_points - 1 where id = $1 and skill_points >= 1 returning skill_points",
    [character.id],
  );
  if (!spent[0]) throw new ProgressionError("No skill points are available.");
  const nextXp = (level + 1) * Number(row.xp_per_level);
  await sql.query("update character_skills set xp = $3, level = $4 where character_id = $1 and skill_id = $2", [
    character.id,
    skillId,
    nextXp,
    level + 1,
  ]);
  await syncTrackedObjectives(sql, character.id);
  return `${row.name} is now level ${level + 1}.`;
}

export type SkillNodeView = {
  id: string;
  name: string;
  summary: string;
  tier: "foundation" | "choice" | "mastery";
  cost: number;
  acquired: boolean;
  blocked: string | null;
};

export async function loadSkillTree(sql: Sql, userId: string): Promise<SkillNodeView[]> {
  const character = await sql.query<{ id: string; specialization: Specialization; level: number; skill_points: number }>(
    "select id, specialization, level, skill_points from characters where user_id = $1",
    [userId],
  );
  const row = character[0];
  if (!row) return [];
  const nodes = await sql.query<{
    id: string;
    name: string;
    summary: string;
    branch: string;
    tier: "foundation" | "choice" | "mastery";
    min_level: number;
    skill_id: string | null;
    skill_level: number;
    requires_node: string | null;
    requires_group: string | null;
    exclusive_group: string | null;
    cost: number;
  }>(
    `select id, name, summary, branch, tier, min_level, skill_id, skill_level, requires_node, requires_group, exclusive_group, cost
     from skill_nodes
     where branch = 'shared' or branch = $1
     order by case tier when 'foundation' then 1 when 'choice' then 2 else 3 end, name`,
    [row.specialization],
  );
  const owned = await sql.query<{ node_id: string; exclusive_group: string | null }>(
    `select owned.node_id, n.exclusive_group
     from character_skill_nodes owned
     join skill_nodes n on n.id = owned.node_id
     where owned.character_id = $1`,
    [row.id],
  );
  const skills = await sql.query<{ id: string; name: string; level: number }>(
    `select d.id, d.name, cs.level
     from character_skills cs
     join skill_definitions d on d.id = cs.skill_id
     where cs.character_id = $1`,
    [row.id],
  );
  const skillLevels = Object.fromEntries(skills.map((skill) => [skill.id, Number(skill.level)]));
  const skillNames = Object.fromEntries(skills.map((skill) => [skill.id, skill.name]));
  const nodeNames = Object.fromEntries(nodes.map((node) => [node.id, node.name]));
  const ownedIds = new Set(owned.map((item) => item.node_id));
  const ownedGroups = new Set(owned.map((item) => item.exclusive_group).filter((group): group is string => Boolean(group)));
  return nodes.map((node) => ({
    id: node.id,
    name: node.name,
    summary: node.summary,
    tier: node.tier,
    cost: Number(node.cost),
    acquired: ownedIds.has(node.id),
    blocked: ownedIds.has(node.id)
      ? null
      : nodeBlockReason(
          {
            id: node.id,
            name: node.name,
            branch: node.branch,
            minLevel: Number(node.min_level),
            skillId: node.skill_id,
            skillLevel: Number(node.skill_level),
            requiresNode: node.requires_node,
            requiresGroup: node.requires_group,
            exclusiveGroup: node.exclusive_group,
            cost: Number(node.cost),
          },
          {
            specialization: row.specialization,
            level: Number(row.level),
            skillPoints: Number(row.skill_points),
            skillLevels,
            ownedIds,
            ownedGroups,
            skillNames,
            nodeNames,
          },
        ),
  }));
}

export async function unlockSkillNode(sql: Sql, userId: string, nodeId: string): Promise<string> {
  const character = await sql.query<{ id: string; specialization: Specialization; level: number; skill_points: number }>(
    "select id, specialization, level, skill_points from characters where user_id = $1 for update",
    [userId],
  );
  const row = character[0];
  if (!row) throw new ProgressionError("Create a character before spending a skill point.");
  const nodes = await sql.query<{
    id: string;
    name: string;
    summary: string;
    branch: string;
    min_level: number;
    skill_id: string | null;
    skill_level: number;
    requires_node: string | null;
    requires_group: string | null;
    exclusive_group: string | null;
    cost: number;
  }>("select id, name, summary, branch, min_level, skill_id, skill_level, requires_node, requires_group, exclusive_group, cost from skill_nodes");
  const node = nodes.find((item) => item.id === nodeId);
  if (!node) throw new ProgressionError("That focus is not in the catalog.");
  const owned = await sql.query<{ node_id: string; exclusive_group: string | null }>(
    `select owned.node_id, n.exclusive_group
     from character_skill_nodes owned
     join skill_nodes n on n.id = owned.node_id
     where owned.character_id = $1
     for update of owned`,
    [row.id],
  );
  if (owned.some((item) => item.node_id === node.id)) throw new ProgressionError("That focus is already acquired.");
  const skills = await sql.query<{ id: string; name: string; level: number }>(
    `select d.id, d.name, cs.level
     from character_skills cs
     join skill_definitions d on d.id = cs.skill_id
     where cs.character_id = $1`,
    [row.id],
  );
  const reason = nodeBlockReason(
    {
      id: node.id,
      name: node.name,
      branch: node.branch,
      minLevel: Number(node.min_level),
      skillId: node.skill_id,
      skillLevel: Number(node.skill_level),
      requiresNode: node.requires_node,
      requiresGroup: node.requires_group,
      exclusiveGroup: node.exclusive_group,
      cost: Number(node.cost),
    },
    {
      specialization: row.specialization,
      level: Number(row.level),
      skillPoints: Number(row.skill_points),
      skillLevels: Object.fromEntries(skills.map((skill) => [skill.id, Number(skill.level)])),
      ownedIds: new Set(owned.map((item) => item.node_id)),
      ownedGroups: new Set(owned.map((item) => item.exclusive_group).filter((group): group is string => Boolean(group))),
      skillNames: Object.fromEntries(skills.map((skill) => [skill.id, skill.name])),
      nodeNames: Object.fromEntries(nodes.map((item) => [item.id, item.name])),
    },
  );
  if (reason) throw new ProgressionError(reason);
  const spent = await sql.query<{ skill_points: number }>(
    "update characters set skill_points = skill_points - $2 where id = $1 and skill_points >= $2 returning skill_points",
    [row.id, Number(node.cost)],
  );
  if (!spent[0]) throw new ProgressionError("No skill points are available.");
  try {
    await sql.query("insert into character_skill_nodes (character_id, node_id) values ($1, $2)", [row.id, node.id]);
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && (error as { code: string }).code === "23505") {
      throw new ProgressionError("That focus is already acquired.");
    }
    throw error;
  }
  await sql.query(
    `insert into progression_events (character_id, kind, source_key, detail)
     values ($1, 'skill_node', $2, $3)
     on conflict (character_id, source_key) do nothing`,
    [row.id, `node:${node.id}`, node.summary],
  );
  return `Acquired ${node.name}. ${node.summary}`;
}

async function activeObjective(sql: Sql, characterId: string, missionId: string, kind: string) {
  const rows = await sql.query<{ objective_id: string; quantity: number; completed: boolean; status: string }>(
    `select o.id as objective_id, o.quantity, co.completed, cm.status
     from character_missions cm
     join mission_objectives o on o.mission_id = cm.mission_id
     join character_objectives co on co.objective_id = o.id and co.character_id = cm.character_id
     where cm.character_id = $1 and cm.mission_id = $2 and o.kind = $3`,
    [characterId, missionId, kind],
  );
  const row = rows[0];
  if (!row || (row.status !== "active" && !row.completed)) return null;
  return row;
}

export async function acceptMission(sql: Sql, userId: string, missionId: string): Promise<string> {
  const character = await lockCharacter(sql, userId);
  const mission = await sql.query<{ name: string; min_level: number; active: boolean }>(
    "select name, min_level, active from missions where id = $1",
    [missionId],
  );
  const row = mission[0];
  if (!row?.active) throw new ProgressionError("That mission is not available.");
  const allowed = await sql.query<{ ok: number }>(
    "select 1 as ok from mission_specializations where mission_id = $1 and specialization = $2",
    [missionId, character.specialization],
  );
  if (!allowed[0]) throw new ProgressionError("That mission is outside this specialization's introductions.");
  const gate = await sql.query<{ requires_node: string | null; node_name: string | null }>(
    `select m.requires_node, n.name as node_name
     from missions m
     left join skill_nodes n on n.id = m.requires_node
     where m.id = $1`,
    [missionId],
  );
  if (gate[0]?.requires_node) {
    const held = await sql.query<{ ok: number }>(
      "select 1 as ok from character_skill_nodes where character_id = $1 and node_id = $2",
      [character.id, gate[0].requires_node],
    );
    if (!held[0]) throw new ProgressionError(`That contract requires ${gate[0].node_name ?? "a skill focus"}.`);
  }
  if (missionId === BULLETIN_MISSION_ID) {
    const open = await sql.query<{ id: string }>(
      `select e.id
       from world_events e
       where e.country_id = $1
         and e.event_type = 'work_bulletin'
         and e.status = 'active'
         and e.starts_at <= now()
         and e.ends_at > now()
       order by e.ends_at
       limit 1`,
      [character.country_id],
    );
    if (!open[0]) throw new ProgressionError("No work bulletin is open for your political home.");
    const contributed = await sql.query<{ ok: number }>(
      "select 1 as ok from world_event_contributions where event_id = $1 and character_id = $2",
      [open[0].id, character.id],
    );
    if (contributed[0]) throw new ProgressionError("That work bulletin already has your shift.");
  }
  const level = await sql.query<{ level: number }>("select level from characters where id = $1", [character.id]);
  if (Number(level[0]?.level ?? 1) < Number(row.min_level)) throw new ProgressionError("A higher level is required.");
  const existing = await sql.query<{ status: string; repeatable: boolean; available_at: string | Date | null }>(
    `select cm.status, m.repeatable, cm.available_at
     from character_missions cm
     join missions m on m.id = cm.mission_id
     where cm.character_id = $1 and cm.mission_id = $2
     for update of cm`,
    [character.id, missionId],
  );
  if (existing[0] && (!existing[0].repeatable || existing[0].status !== "completed")) {
    throw new ProgressionError("That mission has already been accepted.");
  }
  if (existing[0]?.available_at && new Date(existing[0].available_at).getTime() > Date.now()) {
    throw new ProgressionError(`That contract is not available again until ${formatUtc(existing[0].available_at)}.`);
  }

  if (existing[0]) {
    await sql.query(
      "update character_missions set status = 'active', completed_at = null where character_id = $1 and mission_id = $2",
      [character.id, missionId],
    );
    await sql.query(
      `update character_objectives co
       set progress = 0, completed = false, note = null
       from mission_objectives o
       where co.objective_id = o.id and co.character_id = $1 and o.mission_id = $2`,
      [character.id, missionId],
    );
  } else {
    await sql.query(
      "insert into character_missions (character_id, mission_id, status) values ($1, $2, 'active')",
      [character.id, missionId],
    );
    const objectives = await sql.query<{ id: string }>("select id from mission_objectives where mission_id = $1", [missionId]);
    for (const objective of objectives) {
      await sql.query(
        "insert into character_objectives (character_id, objective_id) values ($1, $2)",
        [character.id, objective.id],
      );
    }
    const delivery = objectives.length
      ? await sql.query<{ item_id: string | null; quantity: number }>(
          "select item_id, quantity from mission_objectives where mission_id = $1 and kind = 'deliver_item'",
          [missionId],
        )
      : [];
    if (delivery[0]?.item_id) {
      await grantItem(sql, character.id, delivery[0].item_id, Number(delivery[0].quantity), `grant:${missionId}`, "mission issue");
    }
  }
  await syncTrackedObjectives(sql, character.id);
  return `Accepted ${row.name}.`;
}

async function grantItem(sql: Sql, characterId: string, itemId: string, quantity: number, sourceKey: string, reason: string): Promise<void> {
  const inserted = await sql.query<{ id: string }>(
    `insert into inventory_events (character_id, item_id, delta, reason, source_key)
     values ($1, $2, $3, $4, $5)
     on conflict (character_id, source_key) do nothing
     returning id`,
    [characterId, itemId, quantity, reason, sourceKey],
  );
  if (!inserted[0]) return;
  const limit = await sql.query<{ stack_limit: number }>("select stack_limit from item_definitions where id = $1", [itemId]);
  const current = await sql.query<{ quantity: number }>(
    "select quantity from inventory_entries where character_id = $1 and item_id = $2 for update",
    [characterId, itemId],
  );
  const next = Number(current[0]?.quantity ?? 0) + quantity;
  if (next > Number(limit[0]?.stack_limit ?? 1)) throw new ProgressionError("That item stack is full.");
  await sql.query(
    `insert into inventory_entries (character_id, item_id, quantity) values ($1, $2, $3)
     on conflict (character_id, item_id) do update set quantity = excluded.quantity`,
    [characterId, itemId, next],
  );
}

export async function submitPopulation(sql: Sql, userId: string, missionId: string, answer: string): Promise<string> {
  const character = await lockCharacter(sql, userId);
  const objective = await activeObjective(sql, character.id, missionId, "match_population");
  if (!objective) throw new ProgressionError("Accept the city research mission first.");
  if (objective.completed) return "That answer is already recorded.";
  const place = await sql.query<{ population: number | string | null }>(
    `select p.population from characters c join places p on p.id = c.place_id where c.id = $1`,
    [character.id],
  );
  const population = place[0]?.population == null ? null : Number(place[0].population);
  if (!populationAnswerMatches(answer, population)) {
    throw new ProgressionError("That does not match the population stored for this city.");
  }
  await sql.query("update character_objectives set progress = 1, completed = true where character_id = $1 and objective_id = $2", [
    character.id,
    objective.objective_id,
  ]);
  await refreshMission(sql, character.id, missionId);
  return "The stored population matches.";
}

export async function submitIntroduction(sql: Sql, userId: string, missionId: string, text: string): Promise<string> {
  const character = await lockCharacter(sql, userId);
  const objective = await activeObjective(sql, character.id, missionId, "mention_city");
  if (!objective) throw new ProgressionError("Accept the introduction mission first.");
  if (objective.completed) return "That introduction is already recorded.";
  const place = await sql.query<{ name: string }>(
    "select p.name from characters c join places p on p.id = c.place_id where c.id = $1",
    [character.id],
  );
  const cityName = place[0]?.name ?? "";
  if (!textMentionsCity(text, cityName)) {
    throw new ProgressionError(`Write 20–400 characters and include ${cityName}.`);
  }
  await sql.query(
    "update character_objectives set progress = 1, completed = true, note = $3 where character_id = $1 and objective_id = $2",
    [character.id, objective.objective_id, text.trim()],
  );
  await refreshMission(sql, character.id, missionId);
  return "Introduction recorded.";
}

export async function deliverShipment(sql: Sql, userId: string, missionId: string): Promise<string> {
  const character = await lockCharacter(sql, userId);
  const objective = await activeObjective(sql, character.id, missionId, "deliver_item");
  if (!objective) throw new ProgressionError("Accept the delivery mission first.");
  if (objective.completed) return "That shipment was already delivered.";
  const item = await sql.query<{ item_id: string; quantity: number }>(
    "select item_id, quantity from mission_objectives where id = $1",
    [objective.objective_id],
  );
  const itemId = item[0]?.item_id;
  const quantity = Number(item[0]?.quantity ?? 1);
  if (!itemId) throw new ProgressionError("This delivery has no item.");
  const held = await sql.query<{ quantity: number }>(
    "select quantity from inventory_entries where character_id = $1 and item_id = $2 for update",
    [character.id, itemId],
  );
  const heldQuantity = Number(held[0]?.quantity ?? 0);
  if (heldQuantity < quantity) throw new ProgressionError("The shipment is not in this character's inventory.");
  if (heldQuantity === quantity) {
    await sql.query("delete from inventory_entries where character_id = $1 and item_id = $2", [character.id, itemId]);
  } else {
    await sql.query("update inventory_entries set quantity = quantity - $3 where character_id = $1 and item_id = $2", [
      character.id,
      itemId,
      quantity,
    ]);
  }
  await sql.query(
    `insert into inventory_events (character_id, item_id, delta, reason, source_key)
     values ($1, $2, $3, 'delivery', $4)`,
    [character.id, itemId, -quantity, `deliver:${missionId}`],
  );
  await sql.query("update character_objectives set progress = $3, completed = true where character_id = $1 and objective_id = $2", [
    character.id,
    objective.objective_id,
    quantity,
  ]);
  await refreshMission(sql, character.id, missionId);
  return "Shipment delivered.";
}

export type CharacterSheet = {
  username: string;
  displayName: string | null;
  biography: string | null;
  portraitKey: string;
  specialization: Specialization;
  specializationTitle: string;
  level: number;
  xpInto: number;
  xpSpan: number;
  skillPoints: number;
  specializationSummary: string;
  practiceUntil: string | null;
  practiceSkillXp: number;
  practiceCharacterXp: number;
  currency: number;
  reputation: number;
  condition: number;
  cityName: string;
  countryName: string;
  latitude: number;
  longitude: number;
  populationLabel: string;
  createdAt: string;
  skills: Array<{
    id: string;
    category: string;
    name: string;
    description: string;
    level: number;
    maxLevel: number;
    xp: number;
    xpPerLevel: number;
    benefit: string;
    practiceUntil: string | null;
  }>;
  availableMissions: Array<{
    id: string;
    name: string;
    description: string;
    category: string;
    difficulty: string;
    xp: number;
    currency: number;
    minLevel: number;
    repeatable: boolean;
  }>;
  upcomingMissions: Array<{ id: string; name: string; description: string; category: string; difficulty: string; minLevel: number }>;
  restingMissions: Array<{ id: string; name: string; availableAt: string }>;
  activeMissions: Array<{
    id: string;
    name: string;
    description: string;
    objectives: Array<{ id: string; description: string; kind: string; completed: boolean; progress: number; quantity: number }>;
  }>;
  completedMissions: string[];
  inventory: Array<{ id: string; name: string; description: string; category: string; quantity: number; stackLimit: number }>;
  events: Array<{ detail: string; xp: number; currency: number; createdAt: string }>;
};

export async function loadCharacterSheet(sql: Sql, userId: string): Promise<CharacterSheet | null> {
  const rows = await sql.query<{
    id: string;
    username: string;
    display_name: string | null;
    biography: string | null;
    portrait_key: string;
    specialization: Specialization;
    level: number;
    xp: number;
    skill_points: number;
    currency: number | string;
    reputation: number;
    condition: number;
    city_name: string;
    country_name: string;
    latitude: number | string;
    longitude: number | string;
    population: number | string | null;
    population_quality: string;
    population_source_token: string | null;
    created_at: string | Date;
  }>(
    `select c.id, c.username, c.display_name, c.biography, c.portrait_key, c.specialization, c.level, c.xp,
            c.skill_points, c.currency, c.reputation, c.condition, c.created_at,
            p.name as city_name, co.name as country_name, p.latitude, p.longitude,
            p.population, p.population_quality, p.population_source_token
     from characters c
     join places p on p.id = c.place_id
     join countries co on co.id = c.country_id
     where c.user_id = $1`,
    [userId],
  );
  const row = rows[0];
  if (!row) return null;
  const progress = levelForXp(Number(row.xp), await levelBands(sql));
  const { populationLabel } = await import("@/lib/geo/format");
  const skills = await sql.query<SkillRow>(
    `select d.id, d.category, d.name, d.description, d.max_level, d.xp_per_level, d.effect_key, d.effect_per_level,
            cs.level, cs.xp, null::timestamptz as "practiceAvailableAt"
     from character_skills cs
     join skill_definitions d on d.id = cs.skill_id
     join characters c on c.id = cs.character_id
     where c.user_id = $1
     order by d.category, d.name`,
    [userId],
  );
  const session = await sql.query<{ available_at: string | Date }>(
    `select cd.available_at
     from action_cooldowns cd
     join characters c on c.id = cd.character_id
     where c.user_id = $1 and cd.action_key = $2`,
    [userId, PRACTICE_ACTION_KEY],
  );
  const sessionUntil = session[0]?.available_at ? new Date(session[0].available_at) : null;
  const practiceUntil = sessionUntil && sessionUntil.getTime() > Date.now() ? sessionUntil.toISOString() : null;
  const preview = practiceGains(
    await ruleAmount(sql, "practice_skill_xp", 10),
    await ruleAmount(sql, "practice_character_xp", 5),
    skills.map((skill) => ({
      effectKey: skill.effect_key,
      effectPerLevel: Number(skill.effect_per_level),
      level: Number(skill.level),
    })),
  );
  preview.skillXp += await nodeBonus(sql, row.id, "practice_skill_xp", { kind: "general" });
  const available = await sql.query<{
    id: string;
    name: string;
    description: string;
    category: string;
    difficulty: string;
    xp_reward: number;
    currency_reward: number;
    min_level: number;
    repeatable: boolean;
  }>(
    `select m.id, m.name, m.description, m.category, m.difficulty, m.xp_reward, m.currency_reward, m.min_level, m.repeatable
     from missions m
     join mission_specializations ms on ms.mission_id = m.id and ms.specialization = $2
     join characters c on c.user_id = $1
     where m.active = true
       and c.level >= m.min_level
       and (
         m.requires_node is null
         or exists (
           select 1 from character_skill_nodes owned
           where owned.character_id = c.id and owned.node_id = m.requires_node
         )
       )
       and (
         m.id <> 'bulletin-shift'
         or exists (
           select 1 from world_events e
           where e.country_id = c.country_id
             and e.event_type = 'work_bulletin'
             and e.status = 'active'
             and e.starts_at <= now()
             and e.ends_at > now()
             and not exists (
               select 1 from world_event_contributions x
               where x.event_id = e.id and x.character_id = c.id
             )
         )
       )
       and (
         not exists (
           select 1 from character_missions cm
           where cm.character_id = c.id and cm.mission_id = m.id
         )
         or exists (
           select 1 from character_missions cm
           where cm.character_id = c.id
             and cm.mission_id = m.id
             and m.repeatable = true
             and cm.status = 'completed'
             and (cm.available_at is null or cm.available_at <= now())
         )
       )
     order by m.min_level, m.name`,
    [userId, row.specialization],
  );
  const upcoming = await sql.query<{ id: string; name: string; description: string; category: string; difficulty: string; min_level: number }>(
    `select m.id, m.name, m.description, m.category, m.difficulty, m.min_level
     from missions m
     join mission_specializations ms on ms.mission_id = m.id and ms.specialization = $2
     join characters c on c.user_id = $1
     where m.active = true
       and c.level < m.min_level
       and not exists (
         select 1 from character_missions cm
         where cm.character_id = c.id and cm.mission_id = m.id and cm.status = 'active'
       )
     order by m.min_level, m.name`,
    [userId, row.specialization],
  );
  const resting = await sql.query<{ id: string; name: string; available_at: string | Date }>(
    `select m.id, m.name, cm.available_at
     from character_missions cm
     join characters c on c.id = cm.character_id
     join missions m on m.id = cm.mission_id
     where c.user_id = $1
       and m.repeatable = true
       and cm.status = 'completed'
       and cm.available_at > now()
     order by cm.available_at`,
    [userId],
  );
  const active = await sql.query<{
    id: string;
    name: string;
    description: string;
    objective_id: string;
    objective: string;
    kind: string;
    completed: boolean;
    progress: number;
    quantity: number;
  }>(
    `select m.id, m.name, m.description, o.id as objective_id, o.description as objective, o.kind,
            co.completed, co.progress, o.quantity
     from character_missions cm
     join characters c on c.id = cm.character_id
     join missions m on m.id = cm.mission_id
     join mission_objectives o on o.mission_id = m.id
     join character_objectives co on co.objective_id = o.id and co.character_id = c.id
     where c.user_id = $1 and cm.status = 'active'
     order by m.name, o.sort_order`,
    [userId],
  );
  const completed = await sql.query<{ name: string }>(
    `select m.name from character_missions cm
     join characters c on c.id = cm.character_id
     join missions m on m.id = cm.mission_id
     where c.user_id = $1 and cm.status = 'completed'
     order by cm.completed_at`,
    [userId],
  );
  const inventory = await sql.query<{ id: string; name: string; description: string; category: string; quantity: number; stack_limit: number }>(
    `select d.id, d.name, d.description, d.category, e.quantity, d.stack_limit
     from inventory_entries e
     join item_definitions d on d.id = e.item_id
     join characters c on c.id = e.character_id
     where c.user_id = $1
     order by d.name`,
    [userId],
  );
  const events = await sql.query<{ detail: string; xp_awarded: number; currency_awarded: number; createdAt: string | Date }>(
    `select e.detail, e.xp_awarded, e.currency_awarded, e.created_at as "createdAt"
     from progression_events e
     join characters c on c.id = e.character_id
     where c.user_id = $1
     order by e.created_at desc
     limit 8`,
    [userId],
  );
  const activeMissions = new Map<string, CharacterSheet["activeMissions"][number]>();
  for (const mission of active) {
    const current = activeMissions.get(mission.id) ?? {
      id: mission.id,
      name: mission.name,
      description: mission.description,
      objectives: [],
    };
    current.objectives.push({
      id: mission.objective_id,
      description: mission.objective,
      kind: mission.kind,
      completed: Boolean(mission.completed),
      progress: Number(mission.progress),
      quantity: Number(mission.quantity),
    });
    activeMissions.set(mission.id, current);
  }

  return {
    username: row.username,
    displayName: row.display_name,
    biography: row.biography,
    portraitKey: row.portrait_key,
    specialization: row.specialization,
    specializationTitle: SPECIALIZATION_DETAILS[row.specialization].title,
    level: progress.level,
    xpInto: progress.into,
    xpSpan: progress.span,
    skillPoints: Number(row.skill_points),
    specializationSummary: SPECIALIZATION_DETAILS[row.specialization].summary,
    practiceUntil,
    practiceSkillXp: preview.skillXp,
    practiceCharacterXp: preview.characterXp,
    currency: Number(row.currency),
    reputation: Number(row.reputation),
    condition: Number(row.condition),
    cityName: row.city_name,
    countryName: row.country_name,
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    populationLabel: populationLabel(
      row.population == null ? null : Number(row.population),
      row.population_quality,
      row.population_source_token,
    ),
    createdAt: new Date(row.created_at).toISOString(),
    skills: skills.map((skill) => ({
      id: skill.id,
      category: skill.category,
      name: skill.name,
      description: skill.description,
      level: Number(skill.level),
      maxLevel: Number(skill.max_level),
      xp: Number(skill.xp),
      xpPerLevel: Number(skill.xp_per_level),
      benefit: skillBenefit(skill.effect_key, Number(skill.effect_per_level), Number(skill.level)),
      practiceUntil,
    })),
    availableMissions: available.map((mission) => ({
      id: mission.id,
      name: mission.name,
      description: mission.description,
      category: mission.category,
      difficulty: mission.difficulty,
      xp: Number(mission.xp_reward),
      currency: Number(mission.currency_reward),
      minLevel: Number(mission.min_level),
      repeatable: Boolean(mission.repeatable),
    })),
    upcomingMissions: upcoming.map((mission) => ({
      id: mission.id,
      name: mission.name,
      description: mission.description,
      category: mission.category,
      difficulty: mission.difficulty,
      minLevel: Number(mission.min_level),
    })),
    restingMissions: resting.map((mission) => ({
      id: mission.id,
      name: mission.name,
      availableAt: new Date(mission.available_at).toISOString(),
    })),
    activeMissions: [...activeMissions.values()],
    completedMissions: completed.map((mission) => mission.name),
    inventory: inventory.map((item) => ({
      id: item.id,
      name: item.name,
      description: item.description,
      category: item.category,
      quantity: Number(item.quantity),
      stackLimit: Number(item.stack_limit),
    })),
    events: events.map((event) => ({
      detail: event.detail,
      xp: Number(event.xp_awarded),
      currency: Number(event.currency_awarded),
      createdAt: new Date(event.createdAt).toISOString(),
    })),
  };
}
