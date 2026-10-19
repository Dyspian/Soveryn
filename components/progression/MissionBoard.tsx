"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useActionState } from "react";
import { ActionFeedback } from "@/components/feedback/ActionFeedback";
import { EntityMark } from "@/components/game/EntityMark";
import { missionAction } from "@/lib/actions/progression";
import { BULLETIN_MISSION_ID } from "@/lib/world/bulletin";
import type { ActionResult } from "@/lib/actions/account";
import { nextObjective, objectiveCount, objectiveLinks, progressWidth } from "@/lib/progression/mission-view";
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
  completed: CharacterSheet["completedMissions"];
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
  const restingIds = new Set(resting.map((mission) => mission.id));
  const finished = completed.filter((mission) => !restingIds.has(mission.id));

  return (
    <div className="space-y-6">
      <ActionFeedback state={state} />
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="panel-quiet px-3 py-2">
          <dt className="kicker">Active</dt>
          <dd className="num text-xl">{active.length}</dd>
        </div>
        <div className="panel-quiet px-3 py-2">
          <dt className="kicker">Available</dt>
          <dd className="num text-xl">{available.length}</dd>
        </div>
        <div className="panel-quiet px-3 py-2">
          <dt className="kicker">Waiting</dt>
          <dd className="num text-xl">{resting.length}</dd>
        </div>
        <div className="panel-quiet px-3 py-2">
          <dt className="kicker">Completed</dt>
          <dd className="num text-xl">{finished.length}</dd>
        </div>
      </dl>
      <div className="grid gap-3 sm:grid-cols-2 sm:items-end">
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
        {active.map((mission) => {
          const count = objectiveCount(mission.objectives);
          const next = nextObjective(mission.objectives);
          return (
          <article key={mission.id} className="panel panel-mark">
            <div className="flex items-start gap-3">
              <EntityMark kind="mission" category={mission.category} label={mission.category} />
              <div className="min-w-0 flex-1">
                <p className="kicker">Active · {mission.category}</p>
                <h3 className="font-serif text-xl">{mission.name}</h3>
                <p className="text-sm text-muted">
                  {count.done} of {count.total} {count.total === 1 ? "objective" : "objectives"}
                </p>
              </div>
            </div>
            <p className="mt-2 text-sm text-muted">{mission.description}</p>
            {next ? (
              <div className="mt-3 border-t border-line pt-3">
                <p className="text-sm">
                  <span className="kicker">Next</span> {next.description}
                  {next.quantity > 1 ? ` · ${next.progress} of ${next.quantity}` : ""}
                </p>
                {next.quantity > 1 ? <ObjectiveMeter label={next.description} progress={next.progress} quantity={next.quantity} /> : null}
                <ObjectiveLinks kind={next.kind} />
                <div className="mt-2">
                  <ObjectiveForm missionId={mission.id} kind={next.kind} action={action} pending={pending} />
                </div>
              </div>
            ) : (
              <p className="mt-3 text-sm text-muted">Every stored objective is marked done. The server finishes the mission when it validates them.</p>
            )}
            {mission.objectives.length > 1 ? (
              <ul className="mt-3 space-y-2">
                {mission.objectives.map((objective) => (
                  <li key={objective.id} className="text-sm">
                    <span>{objective.completed ? "Done" : "Open"} — {objective.description}</span>
                    {objective.quantity > 1 ? <span className="num text-muted"> {objective.progress}/{objective.quantity}</span> : null}
                    {objective.completed || objective.id === next?.id ? null : (
                      <div className="mt-1">
                        <ObjectiveForm missionId={mission.id} kind={objective.kind} action={action} pending={pending} />
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            ) : null}
          </article>
          );
        })}
      </section>
      <section className="space-y-3">
        <h2 className="section-title">Available</h2>
        {shownAvailable.length === 0 ? <p className="text-sm text-muted">No contract in this filter is open for this specialization.</p> : null}
        {shownAvailable.map((mission) => (
          <article key={mission.id} className="panel-quiet">
            <div className="flex items-start gap-3">
              <EntityMark kind="mission" category={mission.category} label={mission.category} />
              <h3 className="font-serif text-xl">{mission.name}</h3>
            </div>
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
            <div className="flex items-start gap-3">
              <EntityMark kind="mission" category={mission.category} label={mission.category} />
              <h3 className="font-serif text-xl">{mission.name}</h3>
            </div>
            <p className="mt-1 text-sm text-muted">{mission.description}</p>
            <p className="mt-2 text-xs text-muted">
              Opens at level {mission.minLevel}. {mission.category} · {mission.difficulty}
            </p>
          </article>
        ))}
      </section>
      <section className="space-y-3">
        <h2 className="section-title">Waiting</h2>
        <p className="text-sm text-muted">A repeatable contract stays here until its stored cooldown ends. That time is not a daily reset.</p>
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
        <p className="mt-1 text-sm text-muted">These are stored completions. A contract that is waiting to repeat is listed above, not here.</p>
        {finished.length === 0 ? <p className="mt-2 text-sm text-muted">No mission has a stored completion outside a cooldown.</p> : null}
        <ul className="mt-3 space-y-2">
          {finished.map((mission) => (
            <li key={mission.id} className="flex items-start gap-3 text-sm">
              <EntityMark kind="mission" category={mission.category} label={mission.category} size="sm" />
              <span>
                <span className="block">{mission.name}</span>
                <span className="text-xs text-muted">
                  {mission.category}
                  {mission.completedAt ? ` · completed ${formatUtc(mission.completedAt)}` : " · completion time is not stored"}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function ObjectiveLinks({ kind }: { kind: string }) {
  const links = objectiveLinks(kind);
  if (links.length === 0) return null;
  return (
    <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm">
      {links.map((link) => (
        <Link key={link.href} href={link.href} className="text-gold">
          {link.label}
        </Link>
      ))}
    </p>
  );
}

function ObjectiveMeter({ label, progress, quantity }: { label: string; progress: number; quantity: number }) {
  return (
    <div
      className="mt-2 h-1.5 overflow-hidden bg-obsidian"
      role="progressbar"
      aria-valuenow={progress}
      aria-valuemin={0}
      aria-valuemax={quantity}
      aria-label={label}
    >
      <div className="h-full bg-gold" style={{ width: `${progressWidth(progress, quantity)}%` }} />
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
