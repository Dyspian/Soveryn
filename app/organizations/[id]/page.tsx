import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { OrganizationDesk } from "@/components/organizations/OrganizationDesk";
import { getCurrentUser } from "@/lib/auth/session";
import { getSql } from "@/lib/db";
import { organizationDesk, openUnderground, underworldStatus } from "@/lib/organizations/queries";

export default async function OrganizationPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.characterId) redirect("/create");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const sql = await getSql();
  const desk = await organizationDesk(sql, id, user.characterId);
  if (!desk) notFound();
  const [status, listings, places, products, peers, deliveries] = await Promise.all([
    underworldStatus(sql, user.characterId),
    openUnderground(sql),
    sql.query<{ id: string; name: string }>(
      `select p.id, p.name from places p
       join starting_locations s on s.place_id = p.id
       where p.country_id = (select country_id from organizations where id = $1) and s.status = 'open'
       order by p.name`,
      [id],
    ),
    sql.query<{ id: string; name: string }>("select id, name from products order by name"),
    sql.query<{ id: string; name: string; tag: string }>(
      "select id, name, tag from organizations where status = 'active' and visibility = 'public' and id <> $1 order by name",
      [id],
    ),
    sql.query<{ id: string; status: string; product: string; quantity: number; payment: number; origin: string; destination: string; poster: boolean; carrier: boolean }>(
      `select d.id, d.status, pr.name as product, d.quantity, d.payment, o.name as origin, dest.name as destination,
              d.poster_character_id = $1 as poster, d.carrier_character_id = $1 as carrier
       from delivery_contracts d
       join products pr on pr.id = d.product_id
       join places o on o.id = d.origin_place_id
       join places dest on dest.id = d.destination_place_id
       where d.status in ('available', 'accepted', 'in_transit')
         and (d.status = 'available' or d.poster_character_id = $1 or d.carrier_character_id = $1)
       order by d.created_at desc limit 8`,
      [user.characterId],
    ),
  ]);
  return (
    <section className="max-w-3xl">
      <Link href="/organizations" className="text-sm text-gold">
        All organizations
      </Link>
      <OrganizationDesk desk={desk} status={status} listings={listings} places={places} products={products} peers={peers} deliveries={deliveries} />
    </section>
  );
}
