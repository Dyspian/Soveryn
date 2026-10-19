import Link from "next/link";
import { redirect } from "next/navigation";
import { CivicTermPanel } from "@/components/progression/CivicTermPanel";
import { MissionBoard } from "@/components/progression/MissionBoard";
import { getCurrentUser } from "@/lib/auth/session";
import { getSql, withTransaction } from "@/lib/db";
import { loadCharacterSheet } from "@/lib/progression/service";
import { settleCivicTerm } from "@/lib/progression/terms";

export default async function MissionsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.characterId) redirect("/create");
  const characterId = user.characterId;
  const term = await withTransaction((tx) => settleCivicTerm(tx, characterId));
  const sheet = await loadCharacterSheet(await getSql(), user.id);
  if (!sheet) redirect("/create");

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="kicker">Progression</p>
          <h1 className="page-title">Missions</h1>
          <p className="max-w-2xl text-muted">{sheet.specializationSummary}</p>
          <p className="mt-2 max-w-2xl text-sm text-muted">Rewards are calculated on the server after the objective is validated. A one-time mission pays once. A repeatable contract pays again only after its cooldown, and only for a new completion.</p>
        </div>
        <p className="flex gap-3 text-sm">
          <Link href="/skills" className="text-gold">
            Skills
          </Link>
          <Link href="/events" className="text-gold">
            Events
          </Link>
        </p>
      </div>
      <CivicTermPanel term={term} />
      <MissionBoard
        available={sheet.availableMissions}
        upcoming={sheet.upcomingMissions}
        resting={sheet.restingMissions}
        active={sheet.activeMissions}
        completed={sheet.completedMissions}
      />
    </section>
  );
}
