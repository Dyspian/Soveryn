import { redirect } from "next/navigation";
import { CommandCenter } from "@/components/dashboard/CommandCenter";
import { loadAttention } from "@/lib/account/player";
import { getCurrentUser } from "@/lib/auth/session";
import { loadDashboardBrief } from "@/lib/dashboard/brief";
import { getSql, withTransaction } from "@/lib/db";
import { getCharacterLocation } from "@/lib/geo/queries";
import { loadCharacterSheet } from "@/lib/progression/service";
import { settleCivicTerm } from "@/lib/progression/terms";
import { loadTravel } from "@/lib/travel/service";
import { loadWorldBoard } from "@/lib/world/events";
import { formatUtc } from "@/lib/world/clock";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.characterId) redirect("/create");
  const characterId = user.characterId;
  const sql = await getSql();
  const term = await withTransaction((tx) => settleCivicTerm(tx, characterId));
  const travel = await loadTravel(sql, user.id);
  const [location, sheet, worldEvents, attention, brief] = await Promise.all([
    getCharacterLocation(sql, user.id),
    loadCharacterSheet(sql, user.id),
    loadWorldBoard(sql, user.id),
    loadAttention(sql, user.characterId),
    loadDashboardBrief(sql, user.characterId),
  ]);
  if (!location || !sheet) redirect("/create");

  return (
    <CommandCenter
      guideDismissed={user.guideDismissed}
      name={location.displayName || location.username}
      username={location.username}
      portraitKey={location.portraitKey}
      biography={location.biography}
      city={location.city}
      sheet={sheet}
      worldEvents={worldEvents.events.filter((event) => event.status === "active")}
      production={attention.production}
      invites={attention.invites}
      brief={brief}
      term={term}
      journeyNote={
        travel?.active
          ? `In transit to ${travel.active.destinationName}. Recorded city stays ${travel.cityName} until ${formatUtc(travel.active.arrivesAt)}.`
          : null
      }
    />
  );
}
