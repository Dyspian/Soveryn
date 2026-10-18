"use client";

import { useEffect, useRef, useState } from "react";
import { SectionHeading } from "@/components/site/SectionHeading";
import { formatUtc, isWorldIntelligence, type WorldBulletin, type WorldIntelligence } from "@/lib/site/intelligence-view";

const METRICS: { key: keyof Pick<WorldIntelligence, "characters" | "politicalHomes" | "publicOrganizations" | "gameConstitutions">; label: string; detail: string }[] = [
  { key: "characters", label: "Characters", detail: "Open accounts with an active character. This is not a count of who is online." },
  { key: "politicalHomes", label: "Political homes", detail: "Distinct countries chosen as a political home. This is not the number of countries on the map." },
  { key: "publicOrganizations", label: "Public organizations", detail: "Active organizations whose visibility is public. Private organizations are not included." },
  { key: "gameConstitutions", label: "Game constitutions", detail: "Player-chosen templates. These are not real governments." },
];

function bulletinLabel(item: WorldBulletin): string {
  if (item.status === "scheduled") return "Scheduled";
  if (item.status === "active") return "Open";
  if (item.outcome === "met") return "Goal met";
  if (item.outcome === "unmet") return "Window missed";
  return "Ended";
}

async function fetchSnapshot(): Promise<WorldIntelligence> {
  const response = await fetch("/api/site/world");
  if (!response.ok) throw new Error("unavailable");
  const body: unknown = await response.json();
  if (!isWorldIntelligence(body)) throw new Error("malformed");
  return body;
}

export function WorldIntelligencePanel({ initial }: { initial: WorldIntelligence | null }) {
  const [snapshot, setSnapshot] = useState(initial);
  const [failed, setFailed] = useState(initial === null);
  const inFlight = useRef(false);

  async function refresh(force: boolean) {
    if (inFlight.current || (!force && document.hidden)) return;
    inFlight.current = true;
    try {
      const next = await fetchSnapshot();
      setSnapshot(next);
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      inFlight.current = false;
    }
  }

  useEffect(() => {
    let stopped = false;
    let timer = 0;

    function schedule() {
      timer = window.setTimeout(() => {
        void refresh(false).finally(() => {
          if (!stopped) schedule();
        });
      }, 60_000);
    }

    function onVisibility() {
      if (!document.hidden) void refresh(false);
    }

    document.addEventListener("visibilitychange", onVisibility);
    schedule();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return (
    <section id="intelligence" className="site-section" aria-labelledby="intelligence-title">
      <div className="mx-auto max-w-6xl min-w-0 px-4">
        <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <SectionHeading id="intelligence-title" kicker="Live world intelligence" title="A snapshot of the stored world.">
            <p>
              These figures are read from the game database. They are not a count of who is signed in, and they do not
              include private organization records.
            </p>
          </SectionHeading>
          <p className="text-xs tracking-[0.16em] text-warning uppercase">Updated recently</p>
        </div>
        {snapshot ? (
          <p className="mt-4 text-sm text-muted">Calculated {formatUtc(snapshot.calculatedAt)}.</p>
        ) : (
          <p className="mt-4 text-sm text-muted">No snapshot is available yet.</p>
        )}
        {failed ? (
          <p className="mt-3 text-sm text-warning" role="status">
            {snapshot ? "The latest refresh failed. The counts above are the last snapshot that loaded." : "The stored counts could not be read."}
          </p>
        ) : null}
        <div className="mt-4">
          <button type="button" className="btn btn-secondary min-h-11 px-4" onClick={() => void refresh(true)}>
            Refresh snapshot
          </button>
        </div>
        <dl className="mt-8 grid gap-px border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
          {METRICS.map((metric) => {
            const value = snapshot?.[metric.key];
            return (
              <div key={metric.key} className="bg-obsidian px-4 py-5">
                <dt className="text-xs tracking-[0.14em] text-muted uppercase">{metric.label}</dt>
                <dd className="num mt-3 font-serif text-4xl text-ink">{value == null ? "Unavailable" : value.toLocaleString("en-US")}</dd>
                <p className="mt-3 text-sm text-muted">{metric.detail}</p>
              </div>
            );
          })}
        </dl>
        <div className="mt-10 border-t border-line pt-6">
          <h3 className="text-sm tracking-[0.14em] text-muted uppercase">Work bulletins</h3>
          {snapshot?.bulletins == null ? (
            <p className="mt-3 text-sm text-muted">Work bulletins could not be read.</p>
          ) : snapshot.bulletins.length === 0 ? (
            <p className="mt-3 text-sm text-muted">No work bulletin is stored.</p>
          ) : (
            <ul className="mt-4 divide-y divide-line border-y border-line">
              {snapshot.bulletins.map((item) => (
                <li key={`${item.title}-${item.endsAt}`} className="grid gap-1 py-4 sm:grid-cols-[9rem_1fr] sm:gap-6">
                  <p className="text-ink">{bulletinLabel(item)}</p>
                  <p className="text-sm text-muted">
                    {item.countryName ? `${item.countryName}. ` : ""}
                    {item.title}. Ends {formatUtc(item.endsAt)}.
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
