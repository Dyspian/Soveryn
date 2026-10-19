import Link from "next/link";
import { redirect } from "next/navigation";
import { Portrait } from "@/components/brand/Portrait";
import { EntityMark } from "@/components/game/EntityMark";
import { NoticeBoard } from "@/components/organizations/NoticeBoard";
import { OrganizationCreate } from "@/components/organizations/OrganizationCreate";
import { getCurrentUser } from "@/lib/auth/session";
import { getSql } from "@/lib/db";
import { ORG_TYPES } from "@/lib/organizations/domain";
import { listOrganizations, loadNoticeFeed } from "@/lib/organizations/queries";

export default async function OrganizationsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.characterId) redirect("/create");
  const sql = await getSql();
  const [organizations, notices, places, invites] = await Promise.all([
    listOrganizations(sql, user.characterId),
    loadNoticeFeed(sql, user.characterId),
    sql.query<{ id: string; name: string }>(
      `select p.id, p.name from places p
       join starting_locations s on s.place_id = p.id
       join characters ch on ch.country_id = p.country_id
       where ch.id = $1 and s.status = 'open'
       order by p.name`,
      [user.characterId],
    ),
    sql.query<{ id: string; name: string }>(
      `select i.id, o.name from organization_invitations i
       join organizations o on o.id = i.organization_id
       where i.character_id = $1 and i.status = 'pending' and i.expires_at > now()`,
      [user.characterId],
    ),
  ]);
  return (
    <section className="max-w-3xl space-y-6">
      <div>
        <p className="kicker">Groups</p>
        <h1 className="page-title">Organizations</h1>
        <p className="mt-2 text-sm text-muted">Player organizations are game groups. They are not real institutions. A rivalry is a relationship record, not control of a country. Warfare is not in this version.</p>
      </div>
      <NoticeBoard feed={notices} />
      <ul className="space-y-2">
        {organizations.map((org) => (
          <li key={org.id} className="panel text-sm">
            <div className="flex items-start gap-3">
              {org.emblemKey ? (
                <Portrait portraitKey={org.emblemKey} className="h-9 w-9 shrink-0" />
              ) : (
                <EntityMark kind="organization" code={org.tag} label={org.name} />
              )}
              <div className="min-w-0">
                <Link href={`/organizations/${org.id}`} className="text-gold">
                  {org.name} [{org.tag}]
                </Link>
                {org.mine ? <span className="ml-2 text-muted">Your organization</span> : null}
                <p className="mt-1 text-muted">
                  {ORG_TYPES[org.orgType as keyof typeof ORG_TYPES]?.label ?? org.orgType} · {org.city} · {org.members} members · {org.recruitment}
                </p>
              </div>
            </div>
          </li>
        ))}
      </ul>
      {organizations.length === 0 ? <p className="text-sm text-muted">No public organization is active.</p> : null}
      <OrganizationCreate places={places} invites={invites} />
    </section>
  );
}
