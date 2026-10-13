import Link from "next/link";
import { redirect } from "next/navigation";
import { CivicTermPanel } from "@/components/progression/CivicTermPanel";
import { EventBoard } from "@/components/world/EventBoard";
import { getCurrentUser } from "@/lib/auth/session";
import { getSql, withTransaction } from "@/lib/db";
import { settleCivicTerm } from "@/lib/progression/terms";
import { loadWorldBoard } from "@/lib/world/events";

export default async function EventsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.characterId) redirect("/create");
  const characterId = user.characterId;
  const term = await withTransaction((tx) => settleCivicTerm(tx, characterId));
  const board = await loadWorldBoard(await getSql(), user.id);

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="kicker">World</p>
          <h1 className="page-title">Events</h1>
          <p className="max-w-2xl text-sm text-muted">
            A work bulletin is a timed country contract. It opens because that country has an open starting city and at least one resident. One company shift by a character whose political home matches the bulletin pays the stored reward once. The tick closes it at the stored end time. A missed window is not replayed.
          </p>
        </div>
        <Link href="/businesses" className="text-sm text-gold">
          Businesses
        </Link>
      </div>
      <CivicTermPanel term={term} />
      <EventBoard events={board.events} />
    </section>
  );
}
