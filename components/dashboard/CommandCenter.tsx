import Link from "next/link";
import { Portrait } from "@/components/brand/Portrait";
import { SavedMap } from "@/components/map/SavedMap";
import { XpBar } from "@/components/progression/XpBar";
import { dismissGuideAction } from "@/lib/actions/account";
import type { DashboardBrief } from "@/lib/dashboard/brief";
import type { CityRecord } from "@/lib/geo/queries";
import type { CharacterSheet } from "@/lib/progression/service";
import type { CivicTermView } from "@/lib/progression/terms";
import { formatUtc } from "@/lib/world/clock";
import type { WorldEventView } from "@/lib/world/events";

const shortcuts = [
  { href: "/map", label: "World" },
  { href: "/character", label: "Character" },
  { href: "/skills", label: "Skills" },
  { href: "/missions", label: "Missions" },
  { href: "/events", label: "Events" },
  { href: "/inventory", label: "Inventory" },
  { href: "/market", label: "Market" },
  { href: "/businesses", label: "Businesses" },
  { href: "/jobs", label: "Jobs" },
  { href: "/politics", label: "Politics" },
  { href: "/organizations", label: "Organizations" },
] as const;

function amount(value: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

function partyRole(role: string): string {
  if (role === "leader") return "Leader";
  if (role === "member") return "Member";
  return role;
}

export function CommandCenter({
  guideDismissed,
  name,
  username,
  portraitKey,
  biography,
  city,
  sheet,
  worldEvents,
  production,
  invites,
  brief,
  term,
  journeyNote = null,
}: {
  guideDismissed: boolean;
  name: string;
  username: string;
  portraitKey: string;
  biography: string | null;
  city: CityRecord;
  sheet: CharacterSheet;
  worldEvents: WorldEventView[];
  production: number;
  invites: number;
  brief: DashboardBrief;
  term: CivicTermView;
  journeyNote?: string | null;
}) {
  const raised = sheet.skills.filter((skill) => skill.level > 0).sort((left, right) => right.level - left.level || left.name.localeCompare(right.name));
  const held = sheet.inventory.slice(0, 4);
  const priorities = prioritiesFor({ sheet, production, invites, brief, term });

  return (
    <section className="space-y-5">
      {guideDismissed ? null : (
        <section className="panel panel-mark">
          <p className="kicker">Setup</p>
          <h2 className="section-title mt-1">Where to start</h2>
          <p className="mt-2 max-w-3xl text-sm text-muted">
            Your character is saved. The map, your character sheet, and missions are the next places to look.
          </p>
          <p className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm">
            <Link href="/map" className="text-gold">Open the map</Link>
            <Link href="/character" className="text-gold">Review your character</Link>
            <Link href="/missions" className="text-gold">See missions</Link>
          </p>
          <form action={dismissGuideAction} className="mt-3">
            <button className="btn btn-secondary">Dismiss guide</button>
          </form>
        </section>
      )}

      <header className="panel">
        <div className="flex flex-wrap items-start gap-4">
          <Portrait portraitKey={portraitKey} className="h-14 w-14 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="kicker">Command</p>
            <h1 className="font-serif text-2xl leading-tight">{name}</h1>
            <p className="text-sm text-muted">
              @{username} · {sheet.specializationTitle}
            </p>
            <p className="text-sm">
              {city.name}, {city.countryName}
            </p>
            {journeyNote ? <p className="text-sm text-gold">{journeyNote}</p> : null}
          </div>
          <div className="w-full sm:max-w-xs sm:flex-1">
            <XpBar level={sheet.level} into={sheet.xpInto} span={sheet.xpSpan} />
          </div>
        </div>
        {biography ? <p className="mt-3 line-clamp-2 text-sm text-muted">{biography}</p> : null}
      </header>

      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="panel">
          <dt className="kicker">Currency</dt>
          <dd className="num mt-1 text-xl">{amount(sheet.currency)}</dd>
        </div>
        <div className="panel">
          <dt className="kicker">Reputation</dt>
          <dd className="num mt-1 text-xl">{amount(sheet.reputation)}</dd>
        </div>
        <div className="panel">
          <dt className="kicker">Condition</dt>
          <dd className="num mt-1 text-xl">
            {sheet.condition}
            <span className="text-sm text-muted"> / 100</span>
          </dd>
          <div className="mt-2 h-1.5 overflow-hidden bg-obsidian" role="progressbar" aria-valuenow={sheet.condition} aria-valuemin={0} aria-valuemax={100} aria-label="Condition">
            <div className="h-full bg-info" style={{ width: `${Math.min(100, Math.max(0, sheet.condition))}%` }} />
          </div>
        </div>
        <div className="panel">
          <dt className="kicker">Skill points</dt>
          <dd className="num mt-1 text-xl">{amount(sheet.skillPoints)}</dd>
        </div>
      </dl>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-5">
          <section className="panel panel-mark">
            <h2 className="section-title">Needs attention</h2>
            {priorities.length === 0 ? (
              <p className="mt-2 text-sm text-muted">Nothing is waiting: no running production, invitation, unread notice, or open mission.</p>
            ) : (
              <ul className="mt-3 space-y-2 text-sm">
                {priorities.map((item) => (
                  <li key={item.key}>
                    <Link href={item.href} className="text-gold">
                      {item.label}
                    </Link>
                    {item.detail ? <span className="text-muted"> — {item.detail}</span> : null}
                  </li>
                ))}
              </ul>
            )}
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
                  : `${sheet.availableMissions.length} ${sheet.availableMissions.length === 1 ? "mission is" : "missions are"} available to accept.`}
              </p>
            ) : (
              <ul className="mt-3 space-y-3">
                {sheet.activeMissions.map((mission) => {
                  const done = mission.objectives.filter((objective) => objective.completed).length;
                  const next = mission.objectives.find((objective) => !objective.completed);
                  return (
                    <li key={mission.id}>
                      <p className="font-medium">{mission.name}</p>
                      <p className="text-sm text-muted">
                        {done} of {mission.objectives.length} objectives done
                        {next ? ` · Next: ${next.description}` : ""}
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
            <p className="mt-3 text-sm text-muted">
              {sheet.completedMissions.length} completed
            </p>
          </section>

          <section className="panel">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="section-title">Skills</h2>
              <Link href="/skills" className="text-sm text-gold">
                Open skills
              </Link>
            </div>
            {raised.length === 0 ? (
              <p className="mt-2 text-sm text-muted">No skill has been raised.</p>
            ) : (
              <ul className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                {raised.slice(0, 6).map((skill) => (
                  <li key={skill.id} className="flex justify-between gap-3">
                    <span>{skill.name}</span>
                    <span className="num text-muted">
                      {skill.level}/{skill.maxLevel}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-sm text-muted">
              {sheet.practiceUntil
                ? `Daily practice is available after ${formatUtc(sheet.practiceUntil)}.`
                : `Daily practice is available. One session grants about ${sheet.practiceSkillXp} skill XP and ${sheet.practiceCharacterXp} character XP.`}
            </p>
          </section>

          <section className="panel">
            <h2 className="section-title">Record</h2>
            <h3 className="mt-3 text-sm text-muted">Your progression</h3>
            {sheet.events.length === 0 ? <p className="mt-1 text-sm text-muted">No progression is recorded yet.</p> : null}
            <ul className="mt-1 space-y-2 text-sm">
              {sheet.events.map((event) => (
                <li key={`${event.createdAt}-${event.detail}`}>
                  <p>{event.detail}{event.xp > 0 ? ` +${amount(event.xp)} XP` : ""}</p>
                  <p className="text-xs text-faint">{formatUtc(event.createdAt)}</p>
                </li>
              ))}
            </ul>
            <h3 className="mt-4 text-sm text-muted">Politics in {city.countryName}</h3>
            {brief.politics.length === 0 ? <p className="mt-1 text-sm text-muted">No political event is recorded for this country.</p> : null}
            <ul className="mt-1 space-y-2 text-sm">
              {brief.politics.map((event) => (
                <li key={event.id}>
                  <p>{event.detail}</p>
                  <p className="text-xs text-faint">{formatUtc(event.createdAt)}</p>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex items-baseline justify-between gap-3">
              <h3 className="text-sm text-muted">Work bulletins</h3>
              <Link href="/events" className="text-sm text-gold">
                Events
              </Link>
            </div>
            {worldEvents.length === 0 ? <p className="mt-1 text-sm text-muted">No work bulletin is open. Deadlines use UTC.</p> : null}
            <ul className="mt-1 space-y-2 text-sm">
              {worldEvents.map((event) => (
                <li key={event.id}>
                  <p>{event.title}</p>
                  <p className="text-xs text-faint">
                    {event.progress} of {event.goal} · ends {formatUtc(event.endsAt)}
                  </p>
                  <p className="text-muted">{event.playerNote}</p>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <aside className="space-y-5">
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
                      <span className="text-muted"> · wage {amount(brief.employment.wage)} per UTC day</span>
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
              <div>
                <dt className="kicker">Businesses</dt>
                <dd className="num mt-1">
                  <Link href="/businesses" className="text-gold">
                    {amount(brief.businesses)} active
                  </Link>
                </dd>
              </div>
            </dl>
          </section>

          <section className="panel">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="section-title">Inventory</h2>
              <Link href="/inventory" className="text-sm text-gold">
                Open
              </Link>
            </div>
            {sheet.inventory.length === 0 ? <p className="mt-2 text-sm text-muted">No items stored.</p> : null}
            <ul className="mt-2 space-y-1 text-sm">
              {held.map((item) => (
                <li key={item.id} className="flex justify-between gap-3">
                  <span className="min-w-0 truncate">{item.name}</span>
                  <span className="num shrink-0 text-muted">× {amount(item.quantity)}</span>
                </li>
              ))}
            </ul>
            {sheet.inventory.length > held.length ? (
              <p className="mt-2 text-sm text-muted">{sheet.inventory.length - held.length} more in inventory.</p>
            ) : null}
          </section>

          <nav aria-label="Shortcuts" className="panel">
            <h2 className="section-title">Go to</h2>
            <ul className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-sm">
              {shortcuts.map((item) => (
                <li key={item.href}>
                  <Link href={item.href === "/politics" ? `/politics/${city.countryIso2}` : item.href} className="text-gold">
                    {item.label}
                  </Link>
                </li>
              ))}
              <li>
                <Link href={`/characters/${username}`} className="text-gold">
                  Public profile
                </Link>
              </li>
            </ul>
          </nav>

          <section>
            <div className="mb-2 flex items-baseline justify-between gap-3">
              <h2 className="section-title">Starting city</h2>
              <Link href="/map" className="text-sm text-gold">
                Open world
              </Link>
            </div>
            <SavedMap city={city} preview />
          </section>
        </aside>
      </div>
    </section>
  );
}

function prioritiesFor({
  sheet,
  production,
  invites,
  brief,
  term,
}: {
  sheet: CharacterSheet;
  production: number;
  invites: number;
  brief: DashboardBrief;
  term: CivicTermView;
}): Array<{ key: string; href: string; label: string; detail?: string }> {
  const items: Array<{ key: string; href: string; label: string; detail?: string }> = [];
  if (term.status === "open") {
    items.push({
      key: "civic-term",
      href: "/events",
      label: "Civic term is open",
      detail: `Ends ${formatUtc(term.endsAt)}`,
    });
  }
  if (sheet.skillPoints > 0) {
    items.push({
      key: "skills",
      href: "/skills",
      label: `${amount(sheet.skillPoints)} skill ${sheet.skillPoints === 1 ? "point is" : "points are"} unspent`,
    });
  }
  for (const mission of sheet.activeMissions) {
    items.push({
      key: mission.id,
      href: "/missions",
      label: `Continue ${mission.name}`,
    });
  }
  if (sheet.activeMissions.length === 0 && sheet.availableMissions.length > 0) {
    items.push({
      key: "available",
      href: "/missions",
      label: `Accept a mission`,
      detail: sheet.availableMissions[0]?.name,
    });
  }
  if (production > 0) {
    items.push({
      key: "production",
      href: "/businesses",
      label: `${production} production ${production === 1 ? "run is" : "runs are"} in progress`,
    });
  }
  if (invites > 0) {
    items.push({
      key: "invites",
      href: "/organizations",
      label: `${invites} organization ${invites === 1 ? "invitation is" : "invitations are"} waiting`,
    });
  }
  if (brief.unreadNotices.length > 0) {
    items.push({
      key: "notices",
      href: "/organizations",
      label: `${brief.unreadNotices.length} unread organization ${brief.unreadNotices.length === 1 ? "notice" : "notices"}`,
      detail: brief.unreadNotices[0]?.detail,
    });
  }
  if (brief.pendingApplications > 0) {
    items.push({
      key: "applications",
      href: "/jobs",
      label: `${brief.pendingApplications} job ${brief.pendingApplications === 1 ? "application is" : "applications are"} waiting for a decision`,
    });
  }
  return items;
}
