"use client";

import { useEffect, useState } from "react";
import { useActionState } from "react";
import { practiceSkillAction, spendSkillPointAction } from "@/lib/actions/progression";
import type { ActionResult } from "@/lib/actions/account";
import type { CharacterSheet } from "@/lib/progression/service";
import { formatUtc } from "@/lib/world/clock";

type Skill = CharacterSheet["skills"][number];

function skillInto(skill: Skill): { into: number; span: number } {
  if (skill.level >= skill.maxLevel || skill.xpPerLevel <= 0) return { into: skill.xp, span: 0 };
  const into = skill.xp - skill.level * skill.xpPerLevel;
  return { into: Math.max(0, into), span: skill.xpPerLevel };
}

export function SkillList({
  skills,
  skillPoints,
  practiceUntil,
  practiceSkillXp,
  practiceCharacterXp,
}: {
  skills: Skill[];
  skillPoints: number;
  practiceUntil: string | null;
  practiceSkillXp: number;
  practiceCharacterXp: number;
}) {
  const [practiceState, practice, practicePending] = useActionState<ActionResult | null, FormData>(practiceSkillAction, null);
  const [spendState, spend, spendPending] = useActionState<ActionResult | null, FormData>(spendSkillPointAction, null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  let category = "";

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        Skill points available: <span className="num text-ink">{skillPoints}</span>. One practice session is shared by every skill.
        {practiceUntil
          ? ` The next session is available after ${formatUtc(practiceUntil)}.`
          : ` This session grants about ${practiceSkillXp} skill XP and ${practiceCharacterXp} character XP.`}
      </p>
      {practiceState?.ok ? <p className="text-sm text-gold" role="status">{practiceState.message}</p> : null}
      {practiceState && !practiceState.ok ? <p className="text-sm text-danger" role="alert">{practiceState.error}</p> : null}
      {spendState?.ok ? <p className="text-sm text-gold" role="status">{spendState.message}</p> : null}
      {spendState && !spendState.ok ? <p className="text-sm text-danger" role="alert">{spendState.error}</p> : null}
      <ul className="space-y-3">
        {skills.map((skill) => {
          const heading = skill.category === category ? null : skill.category;
          category = skill.category;
          const progress = skillInto(skill);
          const atMax = skill.level >= skill.maxLevel;
          const spendReason = atMax ? "Already at the maximum level." : skillPoints < 1 ? "No skill points are available." : "";
          return (
            <li key={skill.id} className="panel">
              {heading ? <p className="kicker mb-2">{heading}</p> : null}
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <h2 className="font-serif text-xl">
                    {skill.name}{" "}
                    <span className="num text-base text-muted">
                      {skill.level}/{skill.maxLevel}
                    </span>
                  </h2>
                  <p className="mt-1 text-sm text-muted">{skill.description}</p>
                  <p className="mt-1 text-sm text-ink">{skill.benefit}</p>
                  <div className="mt-3">
                    <div className="mb-1 flex justify-between text-xs text-muted">
                      <span>{atMax ? "Maximum level" : "Toward the next level"}</span>
                      <span className="num">{progress.span === 0 ? "—" : `${progress.into} / ${progress.span} skill XP`}</span>
                    </div>
                    <div
                      className="h-1.5 overflow-hidden bg-obsidian"
                      role="progressbar"
                      aria-valuenow={progress.span === 0 ? 100 : Math.min(100, Math.round((progress.into / progress.span) * 100))}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={`${skill.name} progress`}
                    >
                      <div
                        className="h-full bg-gold"
                        style={{ width: progress.span === 0 ? "100%" : `${Math.min(100, Math.round((progress.into / progress.span) * 100))}%` }}
                      />
                    </div>
                  </div>
                </div>
                <div className="flex flex-col items-stretch gap-2">
                  <PracticeButton
                    skill={skill}
                    action={practice}
                    pending={practicePending}
                    practiceSkillXp={practiceSkillXp}
                    practiceCharacterXp={practiceCharacterXp}
                  />
                  {confirmId === skill.id ? (
                    <form action={spend} className="space-y-2 border border-line p-2">
                      <input type="hidden" name="skillId" value={skill.id} />
                      <p className="max-w-56 text-xs text-muted">Spend 1 skill point to raise {skill.name}. This cannot be undone here.</p>
                      <div className="flex gap-2">
                        <button disabled={spendPending} className="btn btn-primary">
                          {spendPending ? "Spending…" : "Confirm"}
                        </button>
                        <button type="button" className="btn btn-secondary" onClick={() => setConfirmId(null)}>
                          Cancel
                        </button>
                      </div>
                    </form>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={Boolean(spendReason) || spendPending}
                      title={spendReason || undefined}
                      onClick={() => setConfirmId(skill.id)}
                    >
                      Spend point
                    </button>
                  )}
                  {spendReason ? <p className="max-w-56 text-xs text-muted">{spendReason}</p> : null}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function PracticeButton({
  skill,
  action,
  pending,
  practiceSkillXp,
  practiceCharacterXp,
}: {
  skill: Skill;
  action: (formData: FormData) => void;
  pending: boolean;
  practiceSkillXp: number;
  practiceCharacterXp: number;
}) {
  const [cooling, setCooling] = useState(Boolean(skill.practiceUntil));
  const [confirming, setConfirming] = useState(false);
  useEffect(() => {
    if (!skill.practiceUntil) {
      setCooling(false);
      return;
    }
    const remaining = new Date(skill.practiceUntil).getTime() - Date.now();
    if (remaining <= 0) {
      setCooling(false);
      return;
    }
    setCooling(true);
    const timer = setTimeout(() => setCooling(false), remaining);
    return () => clearTimeout(timer);
  }, [skill.practiceUntil]);

  if (cooling && skill.practiceUntil) {
    return <p className="max-w-56 text-xs text-muted">Daily practice is available after {formatUtc(skill.practiceUntil)}.</p>;
  }
  if (!confirming) {
    return (
      <button type="button" className="btn btn-secondary w-full" onClick={() => setConfirming(true)}>
        Practice
      </button>
    );
  }
  return (
    <form action={action} className="space-y-2 border border-line p-2">
      <input type="hidden" name="skillId" value={skill.id} />
      <p className="max-w-56 text-xs text-muted">
        Practice {skill.name} for about {practiceSkillXp} skill XP and {practiceCharacterXp} character XP. The next session is about 24 hours later.
      </p>
      <div className="flex gap-2">
        <button disabled={pending} className="btn btn-primary">
          {pending ? "Practicing…" : "Confirm"}
        </button>
        <button type="button" className="btn btn-secondary" onClick={() => setConfirming(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}
