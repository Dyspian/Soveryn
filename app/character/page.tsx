import Link from "next/link";
import { redirect } from "next/navigation";
import { Portrait } from "@/components/brand/Portrait";
import { ProfileForm } from "@/components/character/ProfileForm";
import { XpBar } from "@/components/progression/XpBar";
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

function amount(value: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

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
  const recent = sheet.events.slice(0, 4);
  const connections = await listConnections(sql, location.characterId);

  return (
    <section className="space-y-5">
      <header className="panel">
        <div className="flex flex-wrap items-start gap-4">
          <Portrait portraitKey={location.portraitKey} className="h-16 w-16 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="kicker">Character</p>
            <h1 className="font-serif text-2xl leading-tight">{location.displayName || location.username}</h1>
            <p className="text-sm text-muted">
              @{location.username} · {sheet.specializationTitle}
            </p>
            <p className="text-sm">
              Recorded city: {location.city.name}, {location.city.countryName}
            </p>
            <p className="text-xs text-muted">Political home: {travel?.homeCountryName ?? location.city.countryName}</p>
            {travel?.active ? (
              <p className="text-sm">
                In transit to {travel.active.destinationName}. Due {formatUtc(travel.active.arrivesAt)}.
              </p>
            ) : null}
            <p className="text-xs text-faint">Created {formatUtc(sheet.createdAt)}</p>
          </div>
          <div className="w-full sm:max-w-xs">
            <XpBar level={sheet.level} into={sheet.xpInto} span={sheet.xpSpan} />
          </div>
        </div>
        <p className="mt-3 max-w-3xl text-sm text-muted">{summary}</p>
        {travel && travel.recent.length > 0 ? (
          <ul className="mt-3 space-y-1 text-sm text-muted">
            {travel.recent.map((journey) => (
              <li key={journey.id}>
                Arrived in {journey.destinationName} on {formatUtc(journey.arrivedAt)}. Cost {journey.cost}.
              </li>
            ))}
          </ul>
        ) : null}
      </header>

      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="panel">
          <dt className="kicker">Currency</dt>
          <dd className="num mt-1 text-xl">{amount(sheet.currency)}</dd>
        </div>
        <div className="panel">
          <dt className="kicker">Reputation</dt>
          <dd className="num mt-1 text-xl">{amount(sheet.reputation)}</dd>
          <dd className="mt-1 text-xs text-muted">Mission rewards and scandals. Connections do not change it.</dd>
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

      <section className="panel">
        <h2 className="section-title">Personal accounts</h2>
        <p className="mt-2 text-sm text-muted">
          Received <span className="num text-ink">{amount(accounts.income)}</span>
          {" · "}
          Paid <span className="num text-ink">{amount(accounts.spending)}</span>
          {" · "}
          Net <span className="num text-ink">{amount(accounts.income - accounts.spending)}</span>
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
                {amount(entry.amount)}
              </span>
              <span className="text-muted"> · {formatUtc(entry.createdAt)}</span>
            </li>
          ))}
        </ul>
      </section>

      <div className="grid items-start gap-5 lg:grid-cols-2">
        <div className="space-y-5">
          <section className="panel">
            <h2 className="section-title">Place</h2>
            <dl className="mt-3 space-y-2 text-sm">
              <div>
                <dt className="kicker">Starting city</dt>
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
            <p className="mt-3 text-sm">
              <Link href="/map" className="text-gold">
                Open the world map
              </Link>
              {" · "}
              <Link href={`/characters/${location.username}`} className="text-gold">
                Public profile
              </Link>
              {" · "}
              <Link href="/characters" className="text-gold">
                Find characters
              </Link>
              {" · "}
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
                  <Link href={`/characters/${row.username}`} className="text-gold">@{row.username}</Link>
                  <span className="text-muted">
                    {" "}
                    {row.status === "accepted" ? "connected" : row.status === "blocked" ? (row.blockedByViewer ? "blocked by you" : "contact unavailable") : row.outgoing ? "request waiting" : "request received"}
                  </span>
                </li>
              ))}
            </ul>
          </section>

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
                <dd className="mt-1">{brief.employment ? brief.employment.business : <span className="text-muted">No active job</span>}</dd>
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
            <h2 className="section-title">Recent progression</h2>
            {recent.length === 0 ? <p className="mt-2 text-sm text-muted">No progression is recorded yet.</p> : null}
            <ul className="mt-2 space-y-2 text-sm">
              {recent.map((event) => (
                <li key={`${event.createdAt}-${event.detail}`}>
                  <p>
                    {event.detail}
                    {event.xp > 0 ? ` +${amount(event.xp)} XP` : ""}
                  </p>
                  <p className="text-xs text-faint">{formatUtc(event.createdAt)}</p>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-sm">
              <Link href="/skills" className="text-gold">
                Skills
              </Link>
              {" · "}
              <Link href="/missions" className="text-gold">
                Missions
              </Link>
              {" · "}
              <Link href="/inventory" className="text-gold">
                Inventory
              </Link>
              {" · "}
              <Link href="/dashboard" className="text-gold">
                Command center
              </Link>
            </p>
          </section>
        </div>
        <ProfileForm displayName={location.displayName ?? ""} biography={location.biography ?? ""} portraitKey={location.portraitKey} />
      </div>
    </section>
  );
}
