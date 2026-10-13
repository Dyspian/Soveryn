"use client";

import { useMemo, useState } from "react";
import { useActionState } from "react";
import { missionAction } from "@/lib/actions/progression";
import { BULLETIN_MISSION_ID } from "@/lib/world/bulletin";
import type { ActionResult } from "@/lib/actions/account";
import type { CharacterSheet } from "@/lib/progression/service";
import { formatUtc } from "@/lib/world/clock";

export function MissionBoard({
  available,
  upcoming,
  resting,
  active,
  completed,
}: {
  available: CharacterSheet["availableMissions"];
  upcoming: CharacterSheet["upcomingMissions"];
  resting: CharacterSheet["restingMissions"];
  active: CharacterSheet["activeMissions"];
  completed: string[];
}) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(missionAction, null);
  const [category, setCategory] = useState("all");
  const [difficulty, setDifficulty] = useState("all");
  const categories = useMemo(
    () => ["all", ...new Set([...available, ...upcoming].map((mission) => mission.category))],
    [available, upcoming],
  );
  const difficulties = useMemo(
    () => ["all", ...new Set([...available, ...upcoming].map((mission) => mission.difficulty))],
    [available, upcoming],
  );
  const shownAvailable = available.filter(
    (mission) => (category === "all" || mission.category === category) && (difficulty === "all" || mission.difficulty === difficulty),
  );
  const shownUpcoming = upcoming.filter(
    (mission) => (category === "all" || mission.category === category) && (difficulty === "all" || mission.difficulty === difficulty),
  );

  return (
    <div className="space-y-6">
      {state?.ok ? <p className="text-sm text-gold" role="status">{state.message}</p> : null}
      {state && !state.ok ? (
        <p className="text-sm text-danger" role="alert">
          {state.error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <label className="text-sm">
          Category
          <select className="field-inline" value={category} onChange={(event) => setCategory(event.target.value)} aria-label="Mission category">
            {categories.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Difficulty
          <select className="field-inline" value={difficulty} onChange={(event) => setDifficulty(event.target.value)} aria-label="Mission difficulty">
            {difficulties.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
      </div>
      <section className="space-y-3">
        <h2 className="section-title">Active</h2>
        {active.length === 0 ? <p className="text-sm text-muted">No mission is active.</p> : null}
        {active.map((mission) => (
          <article key={mission.id} className="panel">
            <h3 className="font-serif text-xl">{mission.name}</h3>
            <p className="mt-1 text-sm text-muted">{mission.description}</p>
            <ul className="mt-3 space-y-3">
              {mission.objectives.map((objective) => (
                <li key={objective.id}>
                  <p className="text-sm">
                    {objective.completed ? "Done" : "Open"} — {objective.description}
                    {objective.quantity > 1 ? ` (${objective.progress}/${objective.quantity})` : ""}
                  </p>
                  {objective.completed ? null : <ObjectiveForm missionId={mission.id} kind={objective.kind} action={action} pending={pending} />}
                </li>
              ))}
            </ul>
          </article>
        ))}
      </section>
      <section className="space-y-3">
        <h2 className="section-title">Available</h2>
        {shownAvailable.length === 0 ? <p className="text-sm text-muted">No contract in this filter is open for this specialization.</p> : null}
        {shownAvailable.map((mission) => (
          <article key={mission.id} className="panel-quiet">
            <h3 className="font-serif text-xl">{mission.name}</h3>
            <p className="mt-1 text-sm text-muted">{mission.description}</p>
            <p className="mt-2 text-xs text-muted">
              {mission.id === BULLETIN_MISSION_ID
                ? `${mission.category} · ${mission.difficulty} · level ${mission.minLevel}+ · repeatable · the open work bulletin pays once`
                : <>{mission.category} · {mission.difficulty} · level {mission.minLevel}+ · {mission.repeatable ? "repeatable" : "one time"} · <span className="num">{mission.xp}</span> XP · <span className="num">{mission.currency}</span> currency, before skill effects</>}
            </p>
            <form action={action} className="mt-3">
              <input type="hidden" name="intent" value="accept" />
              <input type="hidden" name="missionId" value={mission.id} />
              <button disabled={pending} className="btn btn-primary">
                {pending ? "Saving…" : "Accept"}
              </button>
            </form>
          </article>
        ))}
      </section>
      <section className="space-y-3">
        <h2 className="section-title">Later</h2>
        {shownUpcoming.length === 0 ? <p className="text-sm text-muted">No later contract is waiting on level.</p> : null}
        {shownUpcoming.map((mission) => (
          <article key={mission.id} className="panel-quiet">
            <h3 className="font-serif text-xl">{mission.name}</h3>
            <p className="mt-1 text-sm text-muted">{mission.description}</p>
            <p className="mt-2 text-xs text-muted">
              Opens at level {mission.minLevel}. {mission.category} · {mission.difficulty}
            </p>
          </article>
        ))}
      </section>
      <section className="space-y-3">
        <h2 className="section-title">Waiting</h2>
        {resting.length === 0 ? <p className="text-sm text-muted">No repeatable contract is on cooldown.</p> : null}
        {resting.map((mission) => (
          <article key={mission.id} className="panel-quiet">
            <h3 className="font-serif text-xl">{mission.name}</h3>
            <p className="mt-1 text-sm text-muted">Available again after {formatUtc(mission.availableAt)}.</p>
          </article>
        ))}
      </section>
      <section>
        <h2 className="section-title">Completed</h2>
        {completed.length === 0 ? <p className="mt-2 text-sm text-muted">No mission has been completed.</p> : null}
        <ul className="mt-2 list-disc pl-5 text-sm">
          {completed.map((name) => (
            <li key={name}>{name}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function ObjectiveForm({
  missionId,
  kind,
  action,
  pending,
}: {
  missionId: string;
  kind: string;
  action: (formData: FormData) => void;
  pending: boolean;
}) {
  if (kind === "skill_practiced") {
    return <p className="text-sm text-muted">Use Practice on the matching skill. The mission updates when that practice is saved.</p>;
  }
  if (kind === "skill_level" || kind === "level_reached") {
    return <p className="text-sm text-muted">This completes from the stored level. Opening this page does not finish it.</p>;
  }
  if (kind === "work_shift") {
    return <p className="text-sm text-muted">Work a company shift from a business or job. The shift rules still apply.</p>;
  }
  if (kind === "market_sold") {
    return <p className="text-sm text-muted">This completes when another player buys your open listing. Opening the market does not finish it.</p>;
  }
  if (kind === "shipment_delivered") {
    return <p className="text-sm text-muted">Dispatch goods to another city, then collect the shipment after it arrives. Your character does not move.</p>;
  }
  if (kind === "production_finished") {
    return <p className="text-sm text-muted">Collect a finished recipe into company stock. Starting the recipe does not finish this.</p>;
  }
  if (kind === "journey_arrived") {
    return <p className="text-sm text-muted">Arrive in another open starting city. Selecting it on the map does not finish this.</p>;
  }
  if (kind === "deliver_item") {
    return (
      <form action={action}>
        <input type="hidden" name="intent" value="deliver" />
        <input type="hidden" name="missionId" value={missionId} />
        <button disabled={pending} className="btn btn-secondary">
          {pending ? "Saving…" : "Deliver shipment"}
        </button>
      </form>
    );
  }
  if (kind === "match_population") {
    return (
      <form action={action} className="flex flex-wrap gap-2">
        <input type="hidden" name="intent" value="population" />
        <input type="hidden" name="missionId" value={missionId} />
        <label className="text-sm">
          Population or unreported
          <input name="answer" required className="field max-w-xs" />
        </label>
        <button disabled={pending} className="btn btn-secondary">
          {pending ? "Saving…" : "Check record"}
        </button>
      </form>
    );
  }
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="intent" value="introduction" />
      <input type="hidden" name="missionId" value={missionId} />
      <label className="block text-sm">
        Introduction
        <textarea name="note" required minLength={20} maxLength={400} rows={3} className="field" />
      </label>
      <button disabled={pending} className="btn btn-secondary">
        {pending ? "Saving…" : "Save introduction"}
      </button>
    </form>
  );
}
