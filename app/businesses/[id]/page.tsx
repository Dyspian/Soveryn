import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { BusinessDesk } from "@/components/economy/BusinessDesk";
import { getCurrentUser } from "@/lib/auth/session";
import { getSql } from "@/lib/db";
import { listProducts, listResourceTypes, loadBusiness } from "@/lib/economy/queries";

export default async function BusinessPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.characterId) redirect("/create");
  const { id } = await params;
  const sql = await getSql();
  const business = await loadBusiness(sql, user.id, id);
  if (!business) notFound();
  const [products, resources, cities] = await Promise.all([
    listProducts(sql),
    listResourceTypes(sql),
    sql.query<{ id: string; name: string; country: string }>(
      `select p.id, p.name, c.name as country
       from places p
       join starting_locations s on s.place_id = p.id
       join countries c on c.id = p.country_id
       where s.status <> 'disabled'
       order by c.name, p.name`,
    ),
  ]);
  return (
    <section className="max-w-5xl">
      <Link href="/businesses" className="text-sm text-gold">
        All businesses
      </Link>
      <div className="mt-4">
        <BusinessDesk desk={{ ...business, products, resources, cities }} />
      </div>
    </section>
  );
}
