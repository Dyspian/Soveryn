"use client";

import { useState } from "react";
import Link from "next/link";
import { EntityMark } from "@/components/game/EntityMark";
import {
  chamberDenominator,
  groupSeats,
  hemicycle,
  largestParty,
  orderedSeats,
  unfilledSeats,
  type SeatRecord,
} from "@/lib/politics/composition";
import { governmentClaim } from "@/lib/politics/government-view";

export function ParliamentView({
  seats,
  capacity,
  parliamentSystem,
  executiveSelection,
  coalition,
}: {
  seats: SeatRecord[];
  capacity: number;
  parliamentSystem: string;
  executiveSelection: string;
  coalition: { partyA: string; partyB: string; partyAId: string; partyBId: string } | null;
}) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  if (parliamentSystem !== "pr" || capacity <= 0) {
    return <p className="mt-2 text-sm text-muted">This constitution has no parliament. No seats are drawn.</p>;
  }

  const occupied = orderedSeats(seats);
  const groups = groupSeats(occupied);
  const largest = largestParty(groups);
  const open = unfilledSeats(capacity, occupied.length);
  const denominator = chamberDenominator(capacity, occupied.length);
  const points = hemicycle(occupied.length + open);
  const selected = groups.find((group) => group.key === selectedKey) ?? null;
  const coalitionIds = new Set(coalition ? [coalition.partyAId, coalition.partyBId] : []);
  const counts = groups.filter((group) => group.partyId).map((group) => ({ partyId: group.partyId as string, seats: group.seats }));
  const agreements = coalition ? [{ partyA: coalition.partyAId, partyB: coalition.partyBId }] : [];

  return (
    <div className="mt-4 space-y-4">
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(16rem,0.8fr)]">
        <div>
          <div className="chamber" role="group" aria-label="Schematic parliament">
            {points.map((point, index) => {
              const seat = occupied[index];
              if (!seat) {
                return (
                  <span
                    key={`open-${index}`}
                    className="chamber-seat chamber-seat-open"
                    style={{ left: `${point.x}%`, top: `${point.y}%` }}
                    title="Unfilled seat"
                  >
                    <span className="sr-only">Unfilled seat</span>
                  </span>
                );
              }
              const key = seat.partyId ?? "independent";
              const tone = groups.find((group) => group.key === key)?.tone ?? "independent";
              const active = selectedKey === key;
              const label = `${seat.username ?? "Unnamed character"}, ${seat.party ?? "Independent"}`;
              return (
                <button
                  key={seat.id}
                  type="button"
                  className="chamber-seat"
                  data-tone={tone}
                  data-selected={active ? "true" : "false"}
                  style={{ left: `${point.x}%`, top: `${point.y}%` }}
                  aria-pressed={active}
                  aria-label={label}
                  onClick={() => setSelectedKey((current) => (current === key ? null : key))}
                >
                  <span aria-hidden="true">{(seat.abbreviation || seat.party || "IND").slice(0, 3)}</span>
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-muted">Schematic layout. Seats are grouped by party. This is not an official seating plan.</p>
        </div>
        <div className="panel space-y-3">
          <p className="kicker">Composition</p>
          <p className="text-sm">
            <span className="num">{occupied.length}</span> filled
            {open > 0 ? <> · <span className="num">{open}</span> unfilled</> : null}
            {" · "}
            <span className="num">{denominator}</span> in this chamber
          </p>
          {largest ? (
            <p className="text-sm">Largest seated party: {largest.name}. That is not by itself a government.</p>
          ) : occupied.length > 0 ? (
            <p className="text-sm">No single party holds more seats than the others.</p>
          ) : (
            <p className="text-sm text-muted">No game seats have been filled.</p>
          )}
          {executiveSelection === "parliamentary" ? (
            <p className="text-sm text-muted">A government forms when the largest party, or an active coalition, has more seats than any rival. A tie does not form one.</p>
          ) : (
            <p className="text-sm text-muted">These seats come from a recorded election. They do not by themselves choose the executive.</p>
          )}
          {coalition ? (
            <p className="text-sm">Active coalition: {coalition.partyA} and {coalition.partyB}.</p>
          ) : (
            <p className="text-sm text-muted">No coalition agreement is active.</p>
          )}
          <div className="chamber-bar" aria-hidden="true">
            {groups.map((group) => (
              <span key={group.key} className="chamber-bar-segment" data-tone={group.tone} style={{ width: `${(group.seats / denominator) * 100}%` }} />
            ))}
            {open > 0 ? <span className="chamber-bar-segment" data-tone="open" style={{ width: `${(open / denominator) * 100}%` }} /> : null}
          </div>
          <ul className="space-y-2">
            {groups.map((group) => {
              const active = selectedKey === group.key;
              return (
                <li key={group.key}>
                  <button
                    type="button"
                    className={`flex w-full items-center gap-2 border px-2 py-1.5 text-left text-sm ${active ? "border-gold" : "border-line"}`}
                    aria-pressed={active}
                    onClick={() => setSelectedKey((current) => (current === group.key ? null : group.key))}
                  >
                    <EntityMark kind="party" code={group.abbreviation || group.name} label={group.name} tone={group.tone} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{group.name}</span>
                      <span className="block text-xs text-muted">
                        <span className="num">{group.seats}</span> of <span className="num">{denominator}</span>
                        {group.partyId && coalitionIds.has(group.partyId) ? " · in the active coalition" : ""}
                        {executiveSelection === "parliamentary" && group.partyId
                          ? governmentClaim(group.partyId, counts, agreements).ahead
                            ? " · this bloc has more seats than the rival bloc"
                            : " · this bloc does not outnumber the rival bloc"
                          : ""}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
            {open > 0 ? <li className="text-xs text-muted">{open} seats are unfilled. They are not assigned to a party.</li> : null}
          </ul>
          {selected ? (
            <div>
              <p className="text-sm">{selected.name}</p>
              <ul className="mt-1 space-y-1 text-sm text-muted">
                {occupied
                  .filter((seat) => (seat.partyId ?? "independent") === selected.key)
                  .map((seat) => (
                    <li key={seat.id}>
                      {seat.username ? (
                        <Link href={`/characters/${encodeURIComponent(seat.username)}`} className="text-gold">
                          {seat.username}
                        </Link>
                      ) : (
                        "Unnamed character"
                      )}
                    </li>
                  ))}
              </ul>
              <button type="button" className="btn btn-secondary mt-2" onClick={() => setSelectedKey(null)}>
                Clear selection
              </button>
            </div>
          ) : (
            <p className="text-sm text-muted">Select a party to read who holds its seats.</p>
          )}
        </div>
      </div>
    </div>
  );
}
