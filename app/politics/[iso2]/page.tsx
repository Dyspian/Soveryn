import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PoliticsDesk } from "@/components/politics/PoliticsDesk";
import { getCurrentUser } from "@/lib/auth/session";
import { getSql } from "@/lib/db";
import { countryPolitics, listTemplates } from "@/lib/politics/queries";

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
  return (
    <section className="max-w-3xl space-y-4">
      <p className="text-sm">
        <Link href="/politics" className="text-gold">
          All countries
        </Link>
        {" · "}
        <Link href="/map" className="text-gold">
          World map
        </Link>
      </p>
      <div>
        <p className="kicker">Institutions</p>
        <h1 className="page-title">{politics.country.name}</h1>
        <p className="text-sm text-muted">Game-world politics for this country. Geographic borders stay on the map and are not political control.</p>
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
          elections: politics.elections,
          bills: politics.bills,
          events: politics.events,
          seats: politics.seats,
          investigations: politics.investigations,
          policies: politics.policies,
          treasury: politics.treasury,
          salesTax: politics.salesTax,
          relations: politics.relations,
          treaties: politics.treaties,
          coalition: politics.coalition,
          countries: politics.countries,
        }}
      />
    </section>
  );
}
