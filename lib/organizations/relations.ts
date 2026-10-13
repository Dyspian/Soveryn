import type { Sql } from "@/lib/db";
import { lockCharacter, lockOrg, notify, recordEvent, requirePermission } from "@/lib/organizations/access";
import { OrgError } from "@/lib/organizations/domain";

const AGREEMENTS = ["cooperative", "partner", "allied", "ceasefire"] as const;
type Agreement = (typeof AGREEMENTS)[number];

function ordered(left: string, right: string): [string, string] {
  return left < right ? [left, right] : [right, left];
}

export async function proposeAgreement(sql: Sql, input: { userId: string; organizationId: string; otherOrganizationId: string; proposal: string }): Promise<void> {
  if (!(AGREEMENTS as readonly string[]).includes(input.proposal)) throw new OrgError("That agreement is not available.");
  const proposal = input.proposal as Agreement;
  const character = await lockCharacter(sql, input.userId);
  const org = await lockOrg(sql, input.organizationId);
  const other = await lockOrg(sql, input.otherOrganizationId);
  if (org.id === other.id) throw new OrgError("Choose another organization.");
  await requirePermission(sql, character.id, org.id, "treaties");
  const [organizationA, organizationB] = ordered(org.id, other.id);
  await sql.query(
    `insert into organization_relations (organization_a, organization_b, status, proposal, proposed_by, proposal_expires)
     values ($1, $2, 'neutral', $3, $4, now() + interval '1 day')
     on conflict (organization_a, organization_b) do update
       set proposal = excluded.proposal, proposed_by = excluded.proposed_by, proposal_expires = excluded.proposal_expires, updated_at = now()`,
    [organizationA, organizationB, proposal, character.id],
  );
  await notify(sql, other.leader_character_id, other.id, "agreement", `${org.name} proposed an agreement.`, `proposal:${org.id}:${other.id}:${proposal}`);
  await recordEvent(sql, org.id, "diplomacy", "An agreement was proposed. It is not binding until the other organization accepts.", "members");
}

export async function acceptAgreement(sql: Sql, input: { userId: string; organizationId: string; otherOrganizationId: string }): Promise<void> {
  const character = await lockCharacter(sql, input.userId);
  const org = await lockOrg(sql, input.organizationId);
  await lockOrg(sql, input.otherOrganizationId);
  await requirePermission(sql, character.id, org.id, "treaties");
  const [organizationA, organizationB] = ordered(org.id, input.otherOrganizationId);
  const rows = await sql.query<{ proposal: string | null; proposed_by: string | null; proposal_expires: string | null }>(
    "select proposal, proposed_by, proposal_expires from organization_relations where organization_a = $1 and organization_b = $2 for update",
    [organizationA, organizationB],
  );
  const relation = rows[0];
  if (!relation?.proposal || !relation.proposal_expires || new Date(relation.proposal_expires).getTime() <= Date.now()) {
    throw new OrgError("There is no open proposal to accept.");
  }
  const proposer = await sql.query<{ organization_id: string }>(
    "select organization_id from organization_members where character_id = $1 and status = 'active'",
    [relation.proposed_by],
  );
  if (proposer[0]?.organization_id === org.id) throw new OrgError("The other organization accepts the proposal.");
  await sql.query(
    `update organization_relations
     set status = $3, proposal = null, proposed_by = null, proposal_expires = null, updated_at = now()
     where organization_a = $1 and organization_b = $2`,
    [organizationA, organizationB, relation.proposal],
  );
  await recordEvent(sql, org.id, "diplomacy", "An agreement was accepted.", "public");
  await recordEvent(sql, input.otherOrganizationId, "diplomacy", "An agreement was accepted.", "public");
}

export async function declareRivalry(sql: Sql, input: { userId: string; organizationId: string; otherOrganizationId: string }): Promise<void> {
  const character = await lockCharacter(sql, input.userId);
  const org = await lockOrg(sql, input.organizationId);
  const other = await lockOrg(sql, input.otherOrganizationId);
  if (org.id === other.id) throw new OrgError("Choose another organization.");
  await requirePermission(sql, character.id, org.id, "rivalries");
  const [organizationA, organizationB] = ordered(org.id, other.id);
  await sql.query(
    `insert into organization_relations (organization_a, organization_b, status)
     values ($1, $2, 'rival')
     on conflict (organization_a, organization_b) do update set status = 'rival', updated_at = now()`,
    [organizationA, organizationB],
  );
  await notify(sql, other.leader_character_id, other.id, "rivalry", `${org.name} declared a rivalry.`, `rival:${org.id}:${other.id}`);
  await recordEvent(sql, org.id, "rivalry", "A rivalry was declared. It is not a binding agreement.", "public");
}

export async function endRelation(sql: Sql, input: { userId: string; organizationId: string; otherOrganizationId: string }): Promise<void> {
  const character = await lockCharacter(sql, input.userId);
  const org = await lockOrg(sql, input.organizationId);
  await lockOrg(sql, input.otherOrganizationId);
  await requirePermission(sql, character.id, org.id, "treaties");
  const [organizationA, organizationB] = ordered(org.id, input.otherOrganizationId);
  await sql.query(
    `update organization_relations set status = 'dissolved', proposal = null, proposed_by = null, proposal_expires = null, updated_at = now()
     where organization_a = $1 and organization_b = $2`,
    [organizationA, organizationB],
  );
}
