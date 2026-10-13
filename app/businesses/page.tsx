import Link from "next/link";
import { redirect } from "next/navigation";
import { FoundBusinessForm } from "@/components/economy/FoundBusinessForm";
import { getCurrentUser } from "@/lib/auth/session";
import { getSql } from "@/lib/db";
import { listCategories, listMyBusinesses } from "@/lib/economy/queries";
import { listCountries } from "@/lib/geo/queries";

export default async function BusinessesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.characterId) redirect("/create");
  const sql = await getSql();
  const [businesses, categories, countries] = await Promise.all([
    listMyBusinesses(sql, user.id),
    listCategories(sql),
    listCountries(sql),
  ]);

  return (
    <section className="grid items-start gap-6 lg:grid-cols-2">
      <div>
        <p className="kicker">Trade</p>
        <h1 className="page-title">Businesses</h1>
        <p className="mt-2 text-sm text-muted">
          A company earns when you or a hired worker completes a shift. Service firms, including finance, are credited a fee. Factories collect a finished recipe. Mining, energy, and agriculture extract only when a sourced reserve lets a site open. The balance and ledger on the company page show what came in and what was paid out.
        </p>
        {businesses.length === 0 ? <p className="mt-4 text-sm text-muted">You have not founded a business.</p> : null}
        <ul className="mt-4 space-y-3">
          {businesses.map((business) => (
            <li key={business.id} className="panel">
              <h2 className="font-serif text-xl">
                <Link href={`/businesses/${business.id}`} className="text-gold">
                  {business.name}
                </Link>
              </h2>
              <p className="text-sm text-muted">
                {business.categoryName} · {business.city}, {business.country}
              </p>
              <p className="num text-sm">Balance {business.balance.toLocaleString("en-US")}</p>
            </li>
          ))}
        </ul>
      </div>
      <FoundBusinessForm countries={countries} categories={categories} />
    </section>
  );
}
