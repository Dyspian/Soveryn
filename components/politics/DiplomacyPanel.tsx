"use client";

import Link from "next/link";
import { EntityMark } from "@/components/game/EntityMark";
import { diplomacyClass } from "@/components/game/marks";
import { diplomacyEffect, diplomacyLabel, groupRelations, treatiesForCountry } from "@/lib/politics/diplomacy-view";
import { formatUtc } from "@/lib/world/clock";

type Relation = { iso2: string; name: string; status: string; note: string; updatedAt: string | Date };
type Treaty = { title: string; status: string; iso2: string; name: string; createdAt: string | Date };
type Country = { id: string; iso2: string; name: string };

export function DiplomacyPanel({
  countryName,
  homeIso2,
  canAct,
  atHome,
  relations,
  treaties,
  events,
  countries,
  coalition,
  action,
  pending,
}: {
  countryName: string;
  homeIso2: string | null;
  canAct: boolean;
  atHome: boolean;
  relations: Relation[];
  treaties: Treaty[];
  events: { kind: string; detail: string; createdAt: string | Date }[];
  countries: Country[];
  coalition: { partyA: string; partyB: string } | null;
  action: (payload: FormData) => void;
  pending: boolean;
}) {
  const groups = groupRelations(relations);
  const covered = new Set(relations.map((relation) => relation.iso2));
  const unattached = treaties.filter((treaty) => !covered.has(treaty.iso2));

  return (
    <section className="panel space-y-4">
      <div>
        <h2 className="section-title">Diplomacy</h2>
        <p className="mt-1 text-sm text-muted">
          Records for {countryName}. A missing country means no status is stored, not that the relation is neutral. A treaty is a signed title with no military effect.
        </p>
      </div>
      <p className="text-sm">
        {coalition ? `Domestic coalition: ${coalition.partyA} and ${coalition.partyB}. This is not a treaty with another country.` : "No domestic coalition is active."}
      </p>
      {groups.length === 0 ? <p className="text-sm text-muted">No diplomatic status is recorded with another country.</p> : null}
      {groups.map((group) => (
        <div key={group.status}>
          <h3 className="text-sm font-medium">{diplomacyLabel(group.status)}</h3>
          <p className="mt-1 text-xs text-muted">{diplomacyEffect(group.status)}</p>
          <ul className="mt-2 space-y-2">
            {group.rows.map((relation) => {
              const matched = treatiesForCountry(treaties, relation.iso2);
              return (
                <li key={relation.iso2} className="border border-line px-3 py-2 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="inline-flex min-w-0 items-center gap-2">
                      <EntityMark kind="country" code={relation.iso2} label={relation.name} size="sm" />
                      <Link href={`/politics/${relation.iso2.toLowerCase()}`} className="text-gold">
                        {relation.name}
                      </Link>
                    </span>
                    <span className={diplomacyClass(relation.status)}>{diplomacyLabel(relation.status)}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    {relation.note ? `${relation.note} · ` : ""}
                    Updated {formatUtc(relation.updatedAt)}
                  </p>
                  {matched.length > 0 ? (
                    <ul className="mt-2 space-y-1 text-xs">
                      {matched.map((treaty) => (
                        <li key={treaty.title}>
                          Treaty: {treaty.title} · {diplomacyLabel(treaty.status)} · {formatUtc(treaty.createdAt)}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-xs text-muted">No treaty is signed with this country.</p>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      {unattached.length > 0 ? (
        <div>
          <h3 className="text-sm font-medium">Treaties without a stored status</h3>
          <ul className="mt-2 space-y-1 text-sm">
            {unattached.map((treaty) => (
              <li key={`${treaty.iso2}-${treaty.title}`}>
                <Link href={`/politics/${treaty.iso2.toLowerCase()}`} className="text-gold">
                  {treaty.name}
                </Link>
                {" · "}
                {treaty.title} · {diplomacyLabel(treaty.status)} · {formatUtc(treaty.createdAt)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {treaties.length === 0 && relations.length === 0 ? <p className="text-sm text-muted">No treaty is signed.</p> : null}
      <div>
        <h3 className="text-sm font-medium">Recorded diplomatic events</h3>
        <p className="mt-1 text-xs text-muted">The latest stored diplomacy and treaty events for this country. The stored text does not always name the other country.</p>
        {events.length === 0 ? <p className="mt-2 text-sm text-muted">No diplomacy or treaty event is stored.</p> : null}
        <ul className="mt-2 space-y-2 text-sm">
          {events.map((item, index) => (
            <li key={`${item.kind}-${index}`}>
              <p>
                {diplomacyLabel(item.kind)}: {item.detail}
              </p>
              <p className="text-xs text-muted">{formatUtc(item.createdAt)}</p>
            </li>
          ))}
        </ul>
      </div>
      {canAct ? (
        <div className="space-y-3 border-t border-line pt-3">
          <p className="text-sm text-muted">Your office may conduct diplomacy for this political home. The server checks that office again when you save.</p>
          <form
            action={action}
            className="grid gap-2 sm:grid-cols-2"
            onSubmit={(event) => {
              const status = String(new FormData(event.currentTarget).get("status"));
              if (!window.confirm(`Save this diplomatic status? ${diplomacyEffect(status)}`)) event.preventDefault();
            }}
          >
            <input type="hidden" name="intent" value="diplomacy" />
            <label className="text-sm">
              Other country
              <select name="otherCountryId" className="field" defaultValue={countries[0]?.id ?? ""}>
                {countries.map((country) => (
                  <option key={country.id} value={country.id}>
                    {country.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              Status
              <select name="status" className="field" defaultValue="neutral">
                <option value="friendly">Friendly</option>
                <option value="neutral">Neutral</option>
                <option value="strained">Strained</option>
                <option value="sanctioned">Sanctioned</option>
              </select>
            </label>
            <label className="text-sm sm:col-span-2">
              Note
              <input name="note" maxLength={200} className="field" />
            </label>
            <button disabled={pending || countries.length === 0} className="btn btn-secondary">
              Save status
            </button>
          </form>
          <form action={action} className="grid gap-2 sm:grid-cols-2" onSubmit={(event) => {
            if (!window.confirm("Sign this treaty title? It stores the title and has no military effect. It does not change travel, trade, or a sanction.")) event.preventDefault();
          }}>
            <input type="hidden" name="intent" value="treaty" />
            <label className="text-sm">
              Other country
              <select name="iso2" className="field" defaultValue={countries[0]?.iso2 ?? ""}>
                {countries.map((country) => (
                  <option key={country.iso2} value={country.iso2}>
                    {country.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              Treaty title
              <input name="title" minLength={3} maxLength={80} required className="field" />
            </label>
            <p className="text-xs text-muted sm:col-span-2">Signing stores the title. It does not change travel, trade, or a sanction.</p>
            <button disabled={pending || countries.length === 0} className="btn btn-secondary">
              Sign treaty
            </button>
          </form>
        </div>
      ) : (
        <p className="border-t border-line pt-3 text-sm text-muted">
          {atHome
            ? "No active office in this political home may conduct diplomacy, so saving a status or signing a treaty stays closed."
            : "Saving a status or signing a treaty is available on your political home, and only for an office that may conduct diplomacy."}{" "}
          {!atHome && homeIso2 ? (
            <Link href={`/politics/${homeIso2.toLowerCase()}`} className="text-gold">
              Open your political home
            </Link>
          ) : null}
        </p>
      )}
    </section>
  );
}
