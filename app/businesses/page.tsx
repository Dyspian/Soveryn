import Link from "next/link";
import { redirect } from "next/navigation";
import { EntityMark } from "@/components/game/EntityMark";
import { FoundBusinessForm } from "@/components/economy/FoundBusinessForm";
import { getCurrentUser } from "@/lib/auth/session";
import { getSql } from "@/lib/db";
import { listCategories, listMyBusinesses } from "@/lib/economy/queries";
import { formatCount } from "@/lib/game/format";
import { listCountries } from "@/lib/geo/queries";

export default async function BusinessesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.characterId) redirect("/create");
  const sql = await getSql();
  const [businesses, categories, countries, wallet] = await Promise.all([
    listMyBusinesses(sql, user.id),
    listCategories(sql),
    listCountries(sql),
    sql.query<{ currency: number | string }>("select currency from characters where user_id = $1", [user.id]),
  ]);
  const personal = Number(wallet[0]?.currency ?? 0);
  const companyBalances = businesses.reduce((sum, business) => sum + business.balance, 0);

  return (
    <section className="space-y-6">
      <div>
        <p className="kicker">Trade</p>
        <h1 className="page-title">Businesses</h1>
        <p className="mt-2 max-w-3xl text-sm text-muted">
          A company earns when you or a hired worker completes a shift. Service firms, including finance, are credited a fee. Factories collect a finished recipe. Mining, energy, and agriculture extract only when a sourced reserve lets a site open. The balance and ledger on the company page show what came in and what was paid out.
        </p>
      </div>
      <section className="panel">
        <h2 className="section-title">Position</h2>
        <dl className="mt-3 grid gap-4 sm:grid-cols-3">
          <div className="flex items-center gap-3">
            <EntityMark kind="currency" label="Currency" />
            <div>
              <dt className="kicker">Personal currency</dt>
              <dd className="num text-xl text-gold">{formatCount(personal)}</dd>
            </div>
          </div>
          <div>
            <dt className="kicker">Company balances</dt>
            <dd className="num text-xl">{formatCount(companyBalances)}</dd>
            <dd className="mt-1 text-xs text-muted">Sum of companies you own. This is not profit and is separate from personal currency.</dd>
          </div>
          <div>
            <dt className="kicker">Companies</dt>
            <dd className="num text-xl">{formatCount(businesses.length)}</dd>
            <dd className="mt-1 text-xs">
              <Link href="/market" className="text-gold">Market</Link>
              {" · "}
              <Link href="/jobs" className="text-gold">Jobs</Link>
              {" · "}
              <Link href="/resources" className="text-gold">Resource reference</Link>
            </dd>
          </div>
        </dl>
      </section>
      <div className="grid items-start gap-6 lg:grid-cols-2">
      <div>
        {businesses.length === 0 ? <p className="text-sm text-muted">You have not founded a business.</p> : null}
        <ul className="space-y-3">
          {businesses.map((business) => (
            <li key={business.id} className="panel">
              <div className="flex items-start gap-3">
                <EntityMark kind="business" id={business.category} label={business.categoryName} />
                <div className="min-w-0 flex-1">
                  <h2 className="font-serif text-xl">
                    <Link href={`/businesses/${business.id}`} className="text-gold">
                      {business.name}
                    </Link>
                  </h2>
                  <p className="mt-1 flex items-center gap-2 text-sm text-muted">
                    <EntityMark kind="country" code={business.iso2} label={business.country} size="sm" />
                    <span>
                      {business.categoryName} · {business.city}, {business.country} · {business.status}
                    </span>
                  </p>
                  <p className="num mt-1 text-sm">Balance {formatCount(business.balance)}</p>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
      <FoundBusinessForm countries={countries} categories={categories} />
      </div>
    </section>
  );
}
