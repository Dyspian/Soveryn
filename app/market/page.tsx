import Link from "next/link";
import { redirect } from "next/navigation";
import { MarketDesk } from "@/components/economy/MarketDesk";
import { getCurrentUser } from "@/lib/auth/session";
import { getSql } from "@/lib/db";
import { cityTradeFacts, listProducts, marketListings, viewerMarket } from "@/lib/economy/queries";
import { listCountries, startingCities } from "@/lib/geo/queries";

export default async function MarketPage({ searchParams }: { searchParams: Promise<{ iso2?: string; place?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.characterId) redirect("/create");
  const query = await searchParams;
  const sql = await getSql();
  const countries = await listCountries(sql);
  const iso2 = (query.iso2 ?? countries[0]?.iso2 ?? "").toUpperCase();
  const cities = iso2 ? await startingCities(sql, iso2) : [];
  const place = cities.find((city) => city.id === query.place) ?? cities[0];
  const [listings, products, wallet, feeRows, taxRows, facts, mine] = place
    ? await Promise.all([
        marketListings(sql, place.id),
        listProducts(sql),
        sql.query<{ currency: number | string }>("select currency from characters where id = $1", [user.characterId]),
        sql.query<{ amount: number | string }>("select amount from game_rules where key = 'market_fee_percent'"),
        sql.query<{ percent: number | null }>(
          `select (
             select v.effect_value from policy_versions v
             where v.country_id = p.country_id and v.effect_key = 'sales_tax_percent' and v.effective_at <= now()
             order by v.effective_at desc limit 1
           ) as percent
           from places p where p.id = $1`,
          [place.id],
        ),
        cityTradeFacts(sql, place.id),
        viewerMarket(sql, user.id, place.id),
      ])
    : [[], [], [], [], [], { sales: [], supply: [] }, { stock: [], listings: [] }];
  const currency = Number(wallet[0]?.currency ?? 0);
  const feePercent = Number(feeRows[0]?.amount ?? 0);
  const salesTax = Number(taxRows[0]?.percent ?? 0);

  return (
    <section className="max-w-3xl space-y-4">
      <div>
        <p className="kicker">Trade</p>
        <h1 className="page-title">City market</h1>
        <p className="text-sm text-muted">Prices are the seller&apos;s listing prices. The server charges a fee and moves stock only if the listing is still open.</p>
      </div>
      <form className="flex flex-wrap items-end gap-2 text-sm" method="get">
        <label>
          Country
          <select name="iso2" defaultValue={iso2} className="field">
            {countries.map((country) => (
              <option key={country.iso2} value={country.iso2}>
                {country.name}
              </option>
            ))}
          </select>
        </label>
        <button className="btn btn-secondary">Show cities</button>
      </form>
      <ul className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
        {cities.map((city) => (
          <li key={city.id}>
            <Link href={`/market?iso2=${city.countryIso2}&place=${city.id}`} className={city.id === place?.id ? "text-gold" : "text-muted"}>
              {city.name}
            </Link>
          </li>
        ))}
      </ul>
      {cities.length === 0 ? <p className="text-sm text-muted">No starting city is open in this country.</p> : null}
      {place && user.characterId ? (
        <MarketDesk
          listings={listings}
          products={products}
          holderId={user.characterId}
          placeId={place.id}
          currency={currency}
          feePercent={feePercent}
          salesTax={salesTax}
          sales={facts.sales}
          supply={facts.supply}
          stock={mine.stock}
          ownListings={mine.listings}
        />
      ) : null}
    </section>
  );
}
