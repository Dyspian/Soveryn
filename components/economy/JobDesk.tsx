"use client";

import { useActionState } from "react";
import { jobAction } from "@/lib/actions/economy";
import type { ActionResult } from "@/lib/actions/account";

export function JobDesk({
  jobs,
  applications,
  employment,
}: {
  jobs: { id: string; title: string; wage: number; business: string; city: string; skill: string | null; minLevel: number }[];
  applications: { id: string; username: string; title: string }[];
  employment: { businessId: string; business: string; category: string; guidance: string; wage: number; status: string; cooling: boolean }[];
}) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(jobAction, null);
  return (
    <div className="space-y-6">
      {state?.ok ? <p className="text-sm text-gold">{state.message}</p> : null}
      {state && !state.ok ? <p className="text-sm text-danger">{state.error}</p> : null}
      <section>
        <h2 className="section-title">Your work</h2>
        {employment.length === 0 ? <p className="mt-2 text-sm text-muted">You have no employment record. Apply to an open job to work at another company.</p> : null}
        <ul className="mt-2 space-y-3">
          {employment.map((job) => (
            <li key={`${job.businessId}-${job.status}`} className="panel text-sm">
              <p>
                {job.business} · wage {job.wage} · {job.status}
              </p>
              {job.status === "active" ? (
                <>
                  <p className="mt-2 text-muted">{job.guidance}</p>
                  <form action={action} className="mt-3">
                    <input type="hidden" name="businessId" value={job.businessId} />
                    <input type="hidden" name="intent" value="shift" />
                    <button disabled={pending || job.cooling} className="btn btn-primary">
                      {pending ? "Working…" : job.cooling ? "Shift on cooldown" : "Work a shift"}
                    </button>
                  </form>
                </>
              ) : null}
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h2 className="section-title">Applications to review</h2>
        {applications.length === 0 ? <p className="mt-2 text-sm text-muted">No applications are waiting.</p> : null}
        <ul className="mt-2 space-y-2">
          {applications.map((application) => (
            <li key={application.id}>
              <form action={action} className="flex items-center justify-between gap-2 text-sm">
                <input type="hidden" name="applicationId" value={application.id} />
                <input type="hidden" name="intent" value="accept" />
                <span>
                  {application.username} · {application.title}
                </span>
                <button disabled={pending} className="btn btn-primary">
                  {pending ? "Hiring…" : "Hire"}
                </button>
              </form>
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h2 className="section-title">Open jobs</h2>
        {jobs.length === 0 ? <p className="mt-2 text-sm text-muted">No jobs are posted.</p> : null}
        <ul className="mt-2 space-y-2">
          {jobs.map((job) => (
            <li key={job.id} className="panel text-sm">
              <h3 className="font-serif text-xl">{job.title}</h3>
              <p>
                {job.business} · {job.city} · wage {job.wage}
              </p>
              {job.skill ? (
                <p className="text-muted">
                  Requires {job.skill} {job.minLevel}. This is a fictional game skill, not a qualification.
                </p>
              ) : null}
              <form action={action} className="mt-2">
                <input type="hidden" name="postingId" value={job.id} />
                <input type="hidden" name="intent" value="apply" />
                <button disabled={pending} className="btn btn-secondary">
                  {pending ? "Applying…" : "Apply"}
                </button>
              </form>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
