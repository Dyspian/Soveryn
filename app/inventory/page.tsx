import Link from "next/link";
import { redirect } from "next/navigation";
import { InventoryDesk } from "@/components/progression/InventoryDesk";
import { getCurrentUser } from "@/lib/auth/session";
import { getSql } from "@/lib/db";
import { loadCharacterSheet } from "@/lib/progression/service";

export default async function InventoryPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.characterId) redirect("/create");
  const sheet = await loadCharacterSheet(await getSql(), user.id);
  if (!sheet) redirect("/create");

  return (
    <section className="space-y-4">
      <div>
        <p className="kicker">Stores</p>
        <h1 className="page-title">Inventory</h1>
        <p className="text-sm text-muted">Stacks you hold. There is no equipment slot or item action beyond what a mission already consumes.</p>
      </div>
      <InventoryDesk items={sheet.inventory} currency={sheet.currency} />
      <p className="text-sm">
        <Link href="/market" className="text-gold">
          Market
        </Link>
        {" · "}
        <Link href="/missions" className="text-gold">
          Missions
        </Link>
      </p>
    </section>
  );
}
