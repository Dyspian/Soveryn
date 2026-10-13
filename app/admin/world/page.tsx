import { redirect } from "next/navigation";
import { WorldAdmin } from "@/components/admin/WorldAdmin";
import { getCurrentUser } from "@/lib/auth/session";
import { getSql } from "@/lib/db";
import { featureEnabled } from "@/lib/release/features";
import { currencyFlows } from "@/lib/world/tick";
import { formatUtc } from "@/lib/world/clock";

export default async function WorldAdminPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") redirect("/");
  const sql = await getSql();
  const [tick, jobs, runs, flows, paused, warfare, bulletins] = await Promise.all([
    sql.query<{ lastFinished: string | null; lastError: string | null }>(
      `select last_finished_at as "lastFinished", last_error as "lastError" from simulation_ticks where id = 1`,
    ),
    sql.query<{ id: string; jobType: string; status: string; attempts: number; lastError: string | null }>(
      `select id, job_type as "jobType", status, attempts, last_error as "lastError"
       from world_jobs where status in ('failed', 'retry', 'running')
       order by updated_at desc limit 12`,
    ),
    sql.query<{ processed: number; failed: number; finished: string | null }>(
      `select processed, failed, finished_at as finished from simulation_runs order by started_at desc limit 5`,
    ),
    currencyFlows(sql),
    sql.query<{ amount: number }>("select amount from game_rules where key = 'sim_paused'"),
    featureEnabled(sql, "feature_warfare"),
    sql.query<{ id: string; title: string; status: string; outcome: string; progress: number; goal: number; endsAt: string }>(
      `select id, title, status, outcome, progress, goal, ends_at as "endsAt"
       from world_events
       where event_type = 'work_bulletin'
       order by starts_at desc
       limit 8`,
    ),
  ]);
  return (
    <section className="max-w-3xl space-y-4">
      <p className="kicker">Administration</p>
      <h1 className="page-title">World tick</h1>
      <p className="text-sm text-muted">
        Deadlines are stored in UTC. The tick reuses the existing production, shipment, contract, and delivery rules, and it opens or closes work bulletins. A retry does not pay a completed job again. A bulletin contribution is paid once.
        This database has no automated backup. Stop the server and copy the data directory before a restore.
        Warfare is {warfare ? "marked on in rules, but no warfare actions exist" : "disabled"}. A city contest changes stored influence and does not transfer a country. The tick counts an election after its voting deadline and counts a due bill once.
      </p>
      <p className="text-sm">Last tick {formatUtc(tick[0]?.lastFinished ?? null)}. {tick[0]?.lastError ? `Last error: ${tick[0].lastError}` : "No tick error is stored."}</p>
      <WorldAdmin paused={Number(paused[0]?.amount ?? 0) > 0} jobs={jobs} />
      <h2 className="section-title">Work bulletins</h2>
      {bulletins.length === 0 ? <p className="text-sm text-muted">No work bulletin is stored.</p> : null}
      <ul className="text-sm">
        {bulletins.map((bulletin) => (
          <li key={bulletin.id}>
            {bulletin.title} · {bulletin.status} · {bulletin.outcome} · {bulletin.progress} of {bulletin.goal} · ends {formatUtc(bulletin.endsAt)}
          </li>
        ))}
      </ul>
      <h2 className="section-title">Recent ticks</h2>
      {runs.length === 0 ? <p className="text-sm text-muted">No tick has been recorded.</p> : null}
      <ul className="text-sm">
        {runs.map((run, index) => (
          <li key={`${run.finished ?? "open"}-${index}`}>
            {formatUtc(run.finished)} · processed {run.processed} · failed {run.failed}
          </li>
        ))}
      </ul>
      <h2 className="font-serif text-2xl">Currency flows</h2>
      <ul className="text-sm">
        {flows.map((flow) => (
          <li key={`${flow.reason}-${flow.direction}`}>
            {flow.direction} · {flow.reason} · {flow.total}
          </li>
        ))}
      </ul>
    </section>
  );
}
