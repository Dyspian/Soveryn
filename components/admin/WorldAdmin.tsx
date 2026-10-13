"use client";

import { useActionState } from "react";
import { worldAdminAction } from "@/lib/actions/world";
import type { ActionResult } from "@/lib/actions/account";

export function WorldAdmin({
  paused,
  jobs,
}: {
  paused: boolean;
  jobs: { id: string; jobType: string; status: string; attempts: number; lastError: string | null }[];
}) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(worldAdminAction, null);
  return (
    <div className="space-y-3">
      {state?.ok ? <p className="text-sm text-gold">{state.message}</p> : null}
      {state && !state.ok ? <p className="text-sm text-danger">{state.error}</p> : null}
      <form action={action}>
        <input type="hidden" name="intent" value="pause" />
        <input type="hidden" name="paused" value={paused ? "no" : "yes"} />
        <button disabled={pending} className="btn btn-secondary">
          {paused ? "Resume the tick" : "Pause the tick"}
        </button>
      </form>
      <h2 className="section-title">Jobs needing attention</h2>
      {jobs.length === 0 ? <p className="text-sm text-muted">No job is failed, retrying, or locked.</p> : null}
      {jobs.map((job) => (
        <form key={job.id} action={action} className="text-sm">
          <input type="hidden" name="intent" value="retry" />
          <input type="hidden" name="jobId" value={job.id} />
          <span>
            {job.jobType} · {job.status} · attempts {job.attempts}
            {job.lastError ? ` · ${job.lastError}` : ""}
          </span>
          {job.status === "failed" ? (
            <button disabled={pending} className="btn btn-secondary ml-2">
              Retry
            </button>
          ) : null}
        </form>
      ))}
    </div>
  );
}
