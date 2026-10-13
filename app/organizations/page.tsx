import Link from "next/link";
import { redirect } from "next/navigation";
import { OrganizationCreate } from "@/components/organizations/OrganizationCreate";
import { organizationsAction } from "@/lib/actions/organizations";

async function markNotice(formData: FormData) {
  "use server";
  await organizationsAction(null, formData);
}
import { getCurrentUser } from "@/lib/auth/session";
import { getSql } from "@/lib/db";
import { ORG_TYPES } from "@/lib/organizations/domain";
import { listOrganizations, viewerNotices } from "@/lib/organizations/queries";

export default async function OrganizationsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.characterId) redirect("/create");
  const sql = await getSql();
  const [organizations, notices, places, invites] = await Promise.all([
    listOrganizations(sql, user.characterId),
    viewerNotices(sql, user.characterId),
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
      {notices.filter((notice) => !notice.read).length > 0 ? (
        <ul className="space-y-1 text-sm">
          {notices
            .filter((notice) => !notice.read)
            .map((notice) => (
              <li key={notice.id}>
                {notice.detail}
                <form action={markNotice} className="inline">
                  <input type="hidden" name="intent" value="read-notice" />
                  <input type="hidden" name="noticeId" value={notice.id} />
                  <button className="btn btn-secondary ml-2">Mark read</button>
                </form>
              </li>
            ))}
        </ul>
      ) : null}
      <ul className="space-y-2">
        {organizations.map((org) => (
          <li key={org.id} className="panel text-sm">
            <Link href={`/organizations/${org.id}`} className="text-gold">
              {org.name} [{org.tag}]
            </Link>
            {org.mine ? <span className="ml-2 text-muted">Your organization</span> : null}
            <p className="mt-1 text-muted">
              {ORG_TYPES[org.orgType as keyof typeof ORG_TYPES]?.label ?? org.orgType} · {org.city} · {org.members} members · {org.recruitment}
            </p>
          </li>
        ))}
      </ul>
      {organizations.length === 0 ? <p className="text-sm text-muted">No public organization is active.</p> : null}
      <OrganizationCreate places={places} invites={invites} />
    </section>
  );
}
