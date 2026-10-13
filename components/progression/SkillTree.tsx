"use client";

import { useState } from "react";
import { useActionState } from "react";
import { unlockSkillNodeAction } from "@/lib/actions/progression";
import type { ActionResult } from "@/lib/actions/account";
import type { SkillNodeView } from "@/lib/progression/service";

const tiers = [
  { id: "foundation", title: "Foundation" },
  { id: "choice", title: "Choose one" },
  { id: "mastery", title: "Mastery" },
] as const;

export function SkillTree({ nodes, skillPoints }: { nodes: SkillNodeView[]; skillPoints: number }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(unlockSkillNodeAction, null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const next = nodes.find((node) => !node.acquired);

  return (
    <section className="space-y-4">
      <div>
        <h2 className="section-title">Focuses</h2>
        <p className="mt-1 max-w-3xl text-sm text-muted">
          A focus spends {nodes[0]?.cost ?? 1} skill point and stays on this character. Specialization cannot be switched. Skill points available:{" "}
          <span className="num text-ink">{skillPoints}</span>.
        </p>
        {next ? (
          <p className="mt-2 text-sm">
            Next: {next.name}. {next.blocked ?? "It can be acquired now."}
          </p>
        ) : (
          <p className="mt-2 text-sm">Every focus for this specialization is acquired.</p>
        )}
        {state?.ok ? <p className="mt-2 text-sm text-gold" role="status">{state.message}</p> : null}
        {state && !state.ok ? <p className="mt-2 text-sm text-danger" role="alert">{state.error}</p> : null}
      </div>
      {tiers.map((tier) => {
        const group = nodes.filter((node) => node.tier === tier.id);
        if (group.length === 0) return null;
        return (
          <div key={tier.id}>
            <h3 className="kicker">{tier.title}</h3>
            <ul className="mt-2 grid gap-3 lg:grid-cols-2">
              {group.map((node) => (
                <li key={node.id} className="panel">
                  <h4 className="font-serif text-xl">{node.name}</h4>
                  <p className="mt-1 text-sm text-muted">{node.summary}</p>
                  {node.acquired ? <p className="mt-2 text-sm text-gold">Acquired</p> : null}
                  {!node.acquired && node.blocked ? <p className="mt-2 text-sm text-muted">{node.blocked}</p> : null}
                  {!node.acquired && !node.blocked && confirmId === node.id ? (
                    <form action={action} className="mt-3 space-y-2 border border-line p-2">
                      <input type="hidden" name="nodeId" value={node.id} />
                      <p className="text-xs text-muted">Spend {node.cost} skill point on {node.name}. This choice stays.</p>
                      <div className="flex gap-2">
                        <button disabled={pending} className="btn btn-primary">
                          {pending ? "Spending…" : "Confirm"}
                        </button>
                        <button type="button" className="btn btn-secondary" onClick={() => setConfirmId(null)}>
                          Cancel
                        </button>
                      </div>
                    </form>
                  ) : null}
                  {!node.acquired && !node.blocked && confirmId !== node.id ? (
                    <button type="button" className="btn btn-primary mt-3" onClick={() => setConfirmId(node.id)}>
                      Acquire
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </section>
  );
}
