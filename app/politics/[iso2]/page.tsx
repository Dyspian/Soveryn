import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { EntityMark } from "@/components/game/EntityMark";
import { PoliticsDesk } from "@/components/politics/PoliticsDesk";
import { getCurrentUser } from "@/lib/auth/session";
import { getSql } from "@/lib/db";
import { countryPolitics, listTemplates, viewerMayDiplomacy } from "@/lib/politics/queries";

export default async function CountryPoliticsPage({ params }: { params: Promise<{ iso2: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.characterId) redirect("/create");
  const { iso2 } = await params;
  if (!/^[A-Za-z]{2}$/.test(iso2)) notFound();
  const sql = await getSql();
  const politics = await countryPolitics(sql, iso2.toUpperCase());
  if (!politics) notFound();
  const templates = await listTemplates(sql);
  const home = await sql.query<{ id: string; iso2: string }>(
    `select c.id, c.iso2 from characters ch join countries c on c.id = ch.country_id where ch.user_id = $1`,
    [user.id],
  );
  const canDiplomacy = Boolean(home[0] && home[0].id === politics.country.id && (await viewerMayDiplomacy(sql, user.id, politics.country.id)));
  return (
    <section className="max-w-5xl space-y-4">
      <p className="text-sm">
        <Link href="/politics" className="text-gold">
          All countries
        </Link>
        {" · "}
        <Link href="/map" className="text-gold">
          World map
        </Link>
      </p>
      <div className="flex items-start gap-3">
        <EntityMark kind="country" code={politics.country.iso2} label={politics.country.name} />
        <div>
          <p className="kicker">Institutions</p>
          <h1 className="page-title">{politics.country.name}</h1>
          <p className="text-sm text-muted">Game-world politics for this country. Geographic borders stay on the map and are not political control.</p>
        </div>
      </div>
      <PoliticsDesk
        desk={{
          characterId: user.characterId,
          countryId: politics.country.id,
          countryName: politics.country.name,
          templates,
          constitution: politics.constitution,
          offices: politics.offices,
          parties: politics.parties.map((party) => ({ ...party, balance: Number(party.balance) })),
          members: politics.members,
          elections: politics.elections,
          candidates: politics.candidates,
          openTallies: politics.openTallies,
          countedElections: politics.countedElections,
          bills: politics.bills,
          events: politics.events,
          seats: politics.seats,
          investigations: politics.investigations,
          policies: politics.policies,
          treasury: politics.treasury,
          salesTax: politics.salesTax,
          relations: politics.relations,
          treaties: politics.treaties,
          diplomacyEvents: politics.diplomacyEvents,
          coalition: politics.coalition,
          countries: politics.countries,
          canDiplomacy,
          atHome: home[0]?.id === politics.country.id,
          homeIso2: home[0]?.iso2 ?? null,
        }}
      />
    </section>
  );
}
