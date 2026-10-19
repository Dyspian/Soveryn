import Link from "next/link";
import { redirect } from "next/navigation";
import { Portrait } from "@/components/brand/Portrait";
import { EntityMark } from "@/components/game/EntityMark";
import { ProfileForm } from "@/components/character/ProfileForm";
import { SkillMeter } from "@/components/progression/SkillMeter";
import { XpBar } from "@/components/progression/XpBar";
import { formatCount } from "@/lib/game/format";
import { skillProgress } from "@/lib/progression/rules";
import { getCurrentUser } from "@/lib/auth/session";
import { loadDashboardBrief } from "@/lib/dashboard/brief";
import { characterAccounts } from "@/lib/economy/queries";
import { getSql } from "@/lib/db";
import { formatCoordinate } from "@/lib/geo/format";
import { getCharacterLocation } from "@/lib/geo/queries";
import { SPECIALIZATION_DETAILS } from "@/lib/progression/rules";
import { loadCharacterSheet } from "@/lib/progression/service";
import { listConnections } from "@/lib/social/connections";
import { loadTravel } from "@/lib/travel/service";
import { formatUtc } from "@/lib/world/clock";

function ledgerLabel(reason: string, direction: string): string {
  if (reason === "market_sale") return direction === "in" ? "market sale" : "market purchase";
  if (reason === "wage") return "wage";
  if (reason === "market_fee") return "market fee";
  if (reason === "sales_tax") return "sales tax";
  if (reason === "shipment_cost") return "shipment";
  if (reason === "travel") return "travel";
  if (reason === "business_startup") return "company founding";
  if (reason === "deposit") return "deposit to a company";
  if (reason === "withdraw") return "withdrawal from a company";
  return reason.replaceAll("_", " ");
}

function partyRole(role: string): string {
  if (role === "leader") return "Leader";
  if (role === "member") return "Member";
  return role;
}

export default async function CharacterPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.characterId) redirect("/create");
  const sql = await getSql();
  const travel = await loadTravel(sql, user.id);
  const [location, sheet, brief, accounts] = await Promise.all([
    getCharacterLocation(sql, user.id),
    loadCharacterSheet(sql, user.id),
    loadDashboardBrief(sql, user.characterId),
    characterAccounts(sql, user.id),
  ]);
  if (!location || !sheet) redirect("/create");
  const summary = SPECIALIZATION_DETAILS[sheet.specialization].summary;
  const recent = sheet.events.slice(0, 6);
  const raised = sheet.skills
    .filter((skill) => skill.level > 0)
    .sort((left, right) => right.level - left.level || left.name.localeCompare(right.name));
  const unraised = sheet.skills.length - raised.length;
  const connections = await listConnections(sql, location.characterId);
  const conditionWidth = Math.min(100, Math.max(0, sheet.condition));

  return (
    <section className="space-y-5">
      <header className="panel">
        <div className="flex flex-wrap items-start gap-4">
          <Portrait portraitKey={location.portraitKey} className="h-20 w-20 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="kicker">Character</p>
            <h1 className="font-serif text-3xl leading-tight">{location.displayName || location.username}</h1>
            <p className="text-sm text-muted">
              @{location.username} · {sheet.specializationTitle}
            </p>
            <p className="mt-2 flex items-center gap-2 text-sm">
              <EntityMark kind="country" code={location.city.countryIso2} label={location.city.countryName} size="sm" />
              <span>
                Recorded city: {location.city.name}, {location.city.countryName}
              </span>
            </p>
            <p className="text-xs text-muted">Political home: {travel?.homeCountryName ?? location.city.countryName}</p>
            {travel?.active ? (
              <p className="text-sm text-gold">
                In transit to {travel.active.destinationName}. Due {formatUtc(travel.active.arrivesAt)}.
              </p>
            ) : null}
            <p className="text-xs text-faint">Created {formatUtc(sheet.createdAt)}</p>
          </div>
        </div>
        <div className="mt-4 max-w-xl">
          <XpBar level={sheet.level} into={sheet.xpInto} span={sheet.xpSpan} />
        </div>
        <p className="mt-3 max-w-3xl text-sm text-muted">{summary}</p>
        {travel && travel.recent.length > 0 ? (
          <ul className="mt-3 space-y-1 text-sm text-muted">
            {travel.recent.map((journey) => (
              <li key={journey.id}>
                Arrived in {journey.destinationName} on {formatUtc(journey.arrivedAt)}. Cost {formatCount(journey.cost)}.
              </li>
            ))}
          </ul>
        ) : null}
      </header>

      <section className="panel">
        <h2 className="section-title">Standing</h2>
        <dl className="mt-3 grid gap-4 sm:grid-cols-3">
          <div className="flex items-center gap-3">
            <EntityMark kind="currency" label="Currency" />
            <div>
              <dt className="kicker">Currency</dt>
              <dd className="num text-xl text-gold">{formatCount(sheet.currency)}</dd>
            </div>
          </div>
          <div>
            <dt className="kicker">Reputation</dt>
            <dd className="num text-xl">{formatCount(sheet.reputation)}</dd>
            <dd className="mt-1 text-xs text-muted">Mission rewards and scandals. Connections do not change it.</dd>
          </div>
          <div>
            <dt className="kicker">Skill points</dt>
            <dd className="num text-xl">{formatCount(sheet.skillPoints)}</dd>
            <dd className="mt-1 text-xs text-muted">
              {sheet.skillPoints > 0 ? (
                <Link href="/skills" className="text-gold">
                  Spend on the skills page
                </Link>
              ) : (
                "None are available to spend."
              )}
            </dd>
          </div>
        </dl>
        <div className="mt-4 border-t border-line pt-4">
          <div className="mb-1 flex justify-between gap-3 text-sm">
            <span className="kicker">Condition</span>
            <span className="num text-muted">{formatCount(sheet.condition)} / 100</span>
          </div>
          <div className="h-2 overflow-hidden bg-obsidian" role="progressbar" aria-valuenow={sheet.condition} aria-valuemin={0} aria-valuemax={100} aria-label="Condition">
            <div className="h-full bg-info" style={{ width: `${conditionWidth}%` }} />
          </div>
          <p className="mt-2 text-xs text-muted">Stored condition. No current action changes it, and held items do not modify it.</p>
        </div>
      </section>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(18rem,0.85fr)]">
        <div className="space-y-5">
          <section className="panel">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="section-title">Skills</h2>
              <Link href="/skills" className="text-sm text-gold">
                Practice
              </Link>
            </div>
            <p className="mt-2 text-sm text-muted">
              {sheet.practiceUntil
                ? `The next shared practice session is available after ${formatUtc(sheet.practiceUntil)}.`
                : `A practice session is available. It grants about ${formatCount(sheet.practiceSkillXp)} skill XP and ${formatCount(sheet.practiceCharacterXp)} character XP.`}
            </p>
            {raised.length === 0 ? <p className="mt-3 text-sm text-muted">No skill has been raised.</p> : null}
            <ul className="mt-3 space-y-4">
              {raised.map((skill) => {
                const progress = skillProgress(skill.xp, skill.level, skill.xpPerLevel, skill.maxLevel);
                return (
                  <li key={skill.id}>
                    <div className="mb-1 flex items-baseline justify-between gap-3">
                      <p className="font-medium">
                        {skill.name} <span className="text-xs text-muted">{skill.category}</span>
                      </p>
                      <p className="num text-sm text-muted">
                        {skill.level}/{skill.maxLevel}
                      </p>
                    </div>
                    <p className="mb-2 text-sm text-muted">{skill.benefit}</p>
                    <SkillMeter name={skill.name} into={progress.into} span={progress.span} />
                  </li>
                );
              })}
            </ul>
            {unraised > 0 ? (
              <p className="mt-3 text-sm text-muted">
                {formatCount(unraised)} {unraised === 1 ? "skill is" : "skills are"} still at level 0.
              </p>
            ) : null}
          </section>

          <section className="panel">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="section-title">Missions</h2>
              <Link href="/missions" className="text-sm text-gold">
                Open missions
              </Link>
            </div>
            {sheet.activeMissions.length === 0 ? (
              <p className="mt-2 text-sm text-muted">
                {sheet.availableMissions.length === 0
                  ? "No mission is active, and none are open for this specialization."
                  : `${formatCount(sheet.availableMissions.length)} ${sheet.availableMissions.length === 1 ? "mission is" : "missions are"} available to accept.`}
              </p>
            ) : (
              <ul className="mt-3 space-y-3">
                {sheet.activeMissions.map((mission) => {
                  const done = mission.objectives.filter((objective) => objective.completed).length;
                  const next = mission.objectives.find((objective) => !objective.completed);
                  return (
                    <li key={mission.id} className="flex items-start gap-3">
                      <EntityMark kind="mission" category={mission.category} label={mission.category} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">{mission.name}</p>
                        <p className="text-xs text-muted">
                          {formatCount(done)} of {formatCount(mission.objectives.length)} objectives
                          {next ? ` · ${next.description}` : ""}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            <p className="mt-3 text-sm text-muted">{formatCount(sheet.completedMissions.length)} completed.</p>
          </section>

          <section className="panel">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="section-title">Holdings</h2>
              <Link href="/inventory" className="text-sm text-gold">
                Inventory
              </Link>
            </div>
            <p className="mt-2 text-sm text-muted">These stacks are stored. They are not equipped, and they do not change level or skills.</p>
            {sheet.inventory.length === 0 ? <p className="mt-3 text-sm text-muted">No items are stored.</p> : null}
            <ul className="mt-3 space-y-2">
              {sheet.inventory.map((item) => (
                <li key={item.id} className="flex items-center gap-3 text-sm">
                  <EntityMark kind="item" id={item.id} category={item.category} label={item.name} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{item.name}</span>
                    <span className="text-xs text-muted">{item.category}</span>
                  </span>
                  <span className="num text-muted">
                    {formatCount(item.quantity)} / {formatCount(item.stackLimit)}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section className="panel">
            <h2 className="section-title">Recent progression</h2>
            {recent.length === 0 ? <p className="mt-2 text-sm text-muted">No progression is recorded yet.</p> : null}
            <ul className="mt-2 space-y-2 text-sm">
              {recent.map((event) => (
                <li key={`${event.createdAt}-${event.detail}`}>
                  <p>
                    {event.detail}
                    {event.xp > 0 ? ` +${formatCount(event.xp)} XP` : ""}
                    {event.currency > 0 ? ` +${formatCount(event.currency)} currency` : ""}
                  </p>
                  <p className="text-xs text-faint">{formatUtc(event.createdAt)}</p>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-sm">
              <Link href="/dashboard" className="text-gold">
                Command center
              </Link>
            </p>
          </section>
        </div>

        <div className="space-y-5">
          <section className="panel">
            <h2 className="section-title">Position</h2>
            <dl className="mt-3 space-y-3 text-sm">
              <div>
                <dt className="kicker">Organization</dt>
                <dd className="mt-1">
                  {brief.organization ? (
                    <Link href={`/organizations/${brief.organization.id}`} className="text-gold">
                      {brief.organization.name}
                    </Link>
                  ) : (
                    <span className="text-muted">No organization</span>
                  )}
                  {brief.organization ? <span className="text-muted"> · {brief.organization.rank}</span> : null}
                </dd>
              </div>
              <div>
                <dt className="kicker">Employment</dt>
                <dd className="mt-1">
                  {brief.employment ? (
                    <>
                      {brief.employment.business}
                      <span className="text-muted"> · wage {formatCount(brief.employment.wage)} per UTC day</span>
                    </>
                  ) : (
                    <span className="text-muted">No active job</span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="kicker">Party</dt>
                <dd className="mt-1">
                  {brief.party ? (
                    <Link href={`/politics/${brief.party.iso2}`} className="text-gold">
                      {brief.party.name}
                    </Link>
                  ) : (
                    <span className="text-muted">No party</span>
                  )}
                  {brief.party ? <span className="text-muted"> · {partyRole(brief.party.role)}</span> : null}
                </dd>
              </div>
              <div>
                <dt className="kicker">Office</dt>
                <dd className="mt-1">
                  {brief.offices.length === 0 ? <span className="text-muted">No office held</span> : null}
                  <ul>
                    {brief.offices.map((office) => (
                      <li key={`${office.iso2}-${office.name}`}>
                        <Link href={`/politics/${office.iso2}`} className="text-gold">
                          {office.name}
                        </Link>
                        <span className="text-muted"> · {office.country}</span>
                      </li>
                    ))}
                  </ul>
                </dd>
              </div>
            </dl>
          </section>

          <section className="panel">
            <h2 className="section-title">Place</h2>
            <dl className="mt-3 space-y-2 text-sm">
              <div>
                <dt className="kicker">Recorded city</dt>
                <dd className="mt-1">
                  {location.city.name}, {location.city.countryName}
                </dd>
              </div>
              <div>
                <dt className="kicker">Coordinates</dt>
                <dd className="num mt-1">
                  {formatCoordinate(location.city.latitude, "lat")}, {formatCoordinate(location.city.longitude, "lon")}
                </dd>
              </div>
            </dl>
            <p className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-sm">
              <Link href="/map" className="text-gold">
                Open the world map
              </Link>
              <Link href={`/characters/${location.username}`} className="text-gold">
                Public profile
              </Link>
              <Link href="/characters" className="text-gold">
                Find characters
              </Link>
              <Link href="/account" className="text-gold">
                Account
              </Link>
            </p>
          </section>

          <section className="panel">
            <h2 className="section-title">Connections</h2>
            <p className="mt-2 text-sm text-muted">Accepted, pending, and blocked contacts. A private organization stays off the public record.</p>
            {connections.length === 0 ? <p className="mt-3 text-sm text-muted">No connection is recorded.</p> : null}
            <ul className="mt-3 space-y-2 text-sm">
              {connections.map((row) => (
                <li key={row.username}>
                  <Link href={`/characters/${row.username}`} className="text-gold">
                    @{row.username}
                  </Link>
                  <span className="text-muted">
                    {" "}
                    {row.status === "accepted"
                      ? "connected"
                      : row.status === "blocked"
                        ? row.blockedByViewer
                          ? "blocked by you"
                          : "contact unavailable"
                        : row.outgoing
                          ? "request waiting"
                          : "request received"}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <ProfileForm displayName={location.displayName ?? ""} biography={location.biography ?? ""} portraitKey={location.portraitKey} />
        </div>
      </div>

      <section className="panel">
        <h2 className="section-title">Personal accounts</h2>
        <p className="mt-2 text-sm text-muted">
          Received <span className="num text-ink">{formatCount(accounts.income)}</span>
          {" · "}
          Paid <span className="num text-ink">{formatCount(accounts.spending)}</span>
          {" · "}
          Net <span className="num text-ink">{formatCount(accounts.income - accounts.spending)}</span>
          . Company and organization balances are separate. These totals count every personal ledger row.
        </p>
        {accounts.entries.length === 0 ? <p className="mt-3 text-sm text-muted">No personal payment has been recorded.</p> : null}
        <ul className="mt-3 space-y-2 text-sm">
          {accounts.entries.map((entry, index) => (
            <li key={`${entry.createdAt}-${entry.reason}-${index}`}>
              <span className="text-ink">{ledgerLabel(entry.reason, entry.direction)}</span>
              <span className="num text-muted">
                {" "}
                {entry.direction === "in" ? "+" : "−"}
                {formatCount(entry.amount)}
              </span>
              <span className="text-muted"> · {formatUtc(entry.createdAt)}</span>
            </li>
          ))}
        </ul>
      </section>
    </section>
  );
}
