import Link from "next/link";
import { notFound } from "next/navigation";
import { Portrait } from "@/components/brand/Portrait";
import { ConnectionPanel } from "@/components/social/ConnectionPanel";
import { getCurrentUser } from "@/lib/auth/session";
import { getSql } from "@/lib/db";
import { formatCoordinate } from "@/lib/geo/format";
import { getPublicCharacter } from "@/lib/geo/queries";
import { SPECIALIZATION_DETAILS, type Specialization } from "@/lib/progression/rules";
import { connectionWith, publicStanding } from "@/lib/social/connections";
import { formatUtc } from "@/lib/world/clock";

export default async function PublicCharacterPage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const sql = await getSql();
  const character = await getPublicCharacter(sql, username);
  if (!character) notFound();
  const identity = await sql.query<{ id: string }>("select id from characters where lower(username) = lower($1)", [character.username]);
  const characterId = identity[0]?.id;
  if (!characterId) notFound();
  const standing = await publicStanding(sql, characterId);
  const viewer = await getCurrentUser();
  const relation = viewer?.characterId && viewer.characterId !== characterId ? await connectionWith(sql, viewer.characterId, characterId) : null;

  return (
    <article className="panel mx-auto max-w-2xl">
      <div className="flex items-center gap-4">
        <Portrait portraitKey={character.portraitKey} />
        <div>
          <p className="kicker">Public record</p>
          <h1 className="page-title">{character.displayName || character.username}</h1>
          <p className="text-muted">
            @{character.username} · level <span className="num">{character.level}</span> ·{" "}
            {SPECIALIZATION_DETAILS[character.specialization as Specialization]?.title ?? character.specialization}
          </p>
        </div>
      </div>
      <p className="mt-6">{character.biography || "This character has not published a biography."}</p>
      <p className="mt-4 text-sm">
        Recorded city: {character.city.name}, {character.city.countryName} (
        {formatCoordinate(character.city.latitude, "lat")}, {formatCoordinate(character.city.longitude, "lon")}).
      </p>
      <section className="mt-6 border-t border-line pt-4 text-sm">
        <h2 className="section-title">Standing</h2>
        <p className="mt-2">
          Reputation <span className="num">{standing.reputation}</span>
        </p>
        <p className="text-muted">This is the stored character score. Mission rewards add to it. A scandal can reduce it. A connection does not change it.</p>
        <p className="mt-3">
          {standing.organizations.length > 0
            ? standing.organizations.map((org) => `${org.name} [${org.tag}]`).join(", ")
            : "No public organization is recorded."}
        </p>
        {standing.firstMission ? (
          <p className="mt-3">Completed {standing.firstMission.name} on {formatUtc(standing.firstMission.completedAt)}.</p>
        ) : (
          <p className="mt-3 text-muted">No completed mission is recorded.</p>
        )}
        {standing.events.length > 0 ? (
          <ul className="mt-3 space-y-1 text-muted">
            {standing.events.map((event) => (
              <li key={`${event.kind}-${event.createdAt}`}>
                {event.detail} {event.reputation > 0 ? `Reputation +${event.reputation}.` : ""} {formatUtc(event.createdAt)}
              </li>
            ))}
          </ul>
        ) : null}
      </section>
      {viewer?.characterId && viewer.characterId !== characterId ? (
        <ConnectionPanel username={character.username} status={relation?.status ?? null} outgoing={relation?.outgoing ?? false} blockedByViewer={relation?.blockedByViewer ?? false} />
      ) : null}
      <p className="mt-6 text-sm">
        <Link href="/map" className="text-gold">Open the world map</Link>
        {viewer?.characterId ? <> · <Link href="/characters" className="text-gold">Find characters</Link></> : null}
      </p>
    </article>
  );
}
