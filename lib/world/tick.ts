import type { Sql } from "@/lib/db";
import { completeProduction, deliverShipment } from "@/lib/economy/service";
import { settleCityContest } from "@/lib/organizations/contests";
import { expireAvailableDelivery, expireDueListings, resolveDelivery, resolveOperation } from "@/lib/organizations/play";
import { rule } from "@/lib/organizations/access";
import { settleBill, settleElection } from "@/lib/politics/service";
import { settleJourney } from "@/lib/travel/service";
import { advanceWorldEvents } from "@/lib/world/events";

type Job = { id: string; job_key: string; job_type: string; entity_id: string | null; attempts: number };

export type TickResult = {
  processed: number;
  failed: number;
  skipped: boolean;
  activated: number;
  resolved: number;
  opened: number;
};

export async function advanceWorld(sql: Sql): Promise<TickResult> {
  const paused = await rule(sql, "sim_paused");
  if (paused > 0) {
    await sql.query("update simulation_ticks set last_finished_at = now(), last_error = 'paused' where id = 1");
    return { processed: 0, failed: 0, skipped: true, activated: 0, resolved: 0, opened: 0 };
  }
  const leaseSeconds = await rule(sql, "sim_lease_seconds");
  const claimed = await sql.query<{ id: number }>(
    `update simulation_ticks set locked_until = now() + ($1 * interval '1 second'), last_started_at = now(), last_error = null
     where id = 1 and (locked_until is null or locked_until <= now())
     returning id`,
    [leaseSeconds],
  );
  if (claimed.length === 0) return { processed: 0, failed: 0, skipped: true, activated: 0, resolved: 0, opened: 0 };

  let processed = 0;
  let failed = 0;
  let activated = 0;
  let resolved = 0;
  let opened = 0;
  try {
    await recoverStaleJobs(sql);
    await reconcile(sql);
    processed += await sweep(sql);
    const events = await advanceWorldEvents(sql);
    activated = events.activated;
    resolved = events.resolved;
    opened = events.opened;
    processed += activated + resolved + opened;
    const jobs = await claimJobs(sql);
    for (const job of jobs) {
      try {
        await runJob(sql, job);
        await sql.query("update world_jobs set status = 'completed', locked_until = null, last_error = null, updated_at = now() where id = $1", [job.id]);
        processed += 1;
      } catch (error) {
        failed += 1;
        const message = error instanceof Error ? error.message.slice(0, 200) : "The job failed.";
        const max = await rule(sql, "sim_max_attempts");
        const terminal = job.attempts >= max;
        await sql.query(
          `update world_jobs
           set status = $2, last_error = $3, locked_until = null, run_at = now() + ($4 * interval '1 second'), updated_at = now()
           where id = $1`,
          [job.id, terminal ? "failed" : "retry", message, job.attempts * 15],
        );
      }
    }
    await sql.query(
      "insert into simulation_runs (finished_at, processed, failed, note) values (now(), $1, $2, 'tick')",
      [processed, failed],
    );
    await sql.query("update simulation_ticks set locked_until = null, last_finished_at = now() where id = 1");
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 200) : "The tick failed.";
    await sql.query("update simulation_ticks set locked_until = null, last_finished_at = now(), last_error = $1 where id = 1", [message]);
    throw error;
  }
  return { processed, failed, skipped: false, activated, resolved, opened };
}

async function recoverStaleJobs(sql: Sql) {
  await sql.query(
    `update world_jobs set status = 'retry', locked_until = null, updated_at = now()
     where status = 'running' and locked_until is not null and locked_until <= now()`,
  );
}

async function reconcile(sql: Sql) {
  const batch = await rule(sql, "sim_batch");
  await sql.query(
    `insert into world_jobs (job_key, job_type, entity_id, run_at, status)
     select 'operation:' || id::text, 'operation', id, completes_at, 'scheduled'
     from operations where status = 'in_progress' and completes_at <= now()
     order by completes_at limit $1
     on conflict (job_key) do nothing`,
    [batch],
  );
  await sql.query(
    `insert into world_jobs (job_key, job_type, entity_id, run_at, status)
     select 'production:' || id::text, 'production', id, completes_at, 'scheduled'
     from production_jobs where status = 'running' and completes_at <= now()
     order by completes_at limit $1
     on conflict (job_key) do nothing`,
    [batch],
  );
  await sql.query(
    `insert into world_jobs (job_key, job_type, entity_id, run_at, status)
     select 'shipment:' || id::text, 'shipment', id, arrives_at, 'scheduled'
     from shipments where status = 'in_transit' and arrives_at <= now()
     order by arrives_at limit $1
     on conflict (job_key) do nothing`,
    [batch],
  );
  await sql.query(
    `insert into world_jobs (job_key, job_type, entity_id, run_at, status)
     select 'delivery:' || id::text, 'delivery', id, arrives_at, 'scheduled'
     from delivery_contracts where status = 'in_transit' and arrives_at <= now()
     order by arrives_at limit $1
     on conflict (job_key) do nothing`,
    [batch],
  );
  await sql.query(
    `insert into world_jobs (job_key, job_type, entity_id, run_at, status)
     select 'delivery-expire:' || id::text, 'delivery_expire', id, deadline, 'scheduled'
     from delivery_contracts where status = 'available' and deadline <= now()
     order by deadline limit $1
     on conflict (job_key) do nothing`,
    [batch],
  );
  await sql.query(
    `insert into world_jobs (job_key, job_type, entity_id, run_at, status)
     select 'journey:' || id::text, 'journey', id, arrives_at, 'scheduled'
     from journeys where status = 'in_transit' and arrives_at <= now()
     order by arrives_at limit $1
     on conflict (job_key) do nothing`,
    [batch],
  );
  await sql.query(
    `insert into world_jobs (job_key, job_type, entity_id, run_at, status)
     select 'election:' || id::text || ':round:' || round::text, 'election', id, voting_ends, 'scheduled'
     from elections
     where status in ('open', 'runoff') and voting_ends <= now()
     order by voting_ends
     limit $1
     on conflict (job_key) do nothing`,
    [batch],
  );
  await sql.query(
    `insert into world_jobs (job_key, job_type, entity_id, run_at, status)
     select 'bill:' || id::text, 'bill', id, voting_ends, 'scheduled'
     from bills
     where status = 'voting' and voting_ends <= now()
     order by voting_ends
     limit $1
     on conflict (job_key) do nothing`,
    [batch],
  );
  await sql.query(
    `insert into world_jobs (job_key, job_type, entity_id, run_at, status)
     select 'city-contest:' || id::text, 'city_contest', id, resolves_at, 'scheduled'
     from city_contests
     where status = 'active' and resolves_at <= now()
     order by resolves_at
     limit $1
     on conflict (job_key) do nothing`,
    [batch],
  );
}

async function claimJobs(sql: Sql): Promise<Job[]> {
  const batch = await rule(sql, "sim_batch");
  const lease = await rule(sql, "sim_lease_seconds");
  const max = await rule(sql, "sim_max_attempts");
  return sql.query<Job>(
    `update world_jobs as job
     set status = 'running', attempts = job.attempts + 1, locked_until = now() + ($2 * interval '1 second'), updated_at = now()
     from (
       select id from world_jobs
       where status in ('scheduled', 'retry') and run_at <= now() and attempts < $3
       order by run_at
       limit $1
       for update skip locked
     ) as picked
     where job.id = picked.id
     returning job.id, job.job_key, job.job_type, job.entity_id, job.attempts`,
    [batch, lease, max],
  );
}

async function runJob(sql: Sql, job: Job) {
  if (!job.entity_id) return;
  if (job.job_type === "operation") {
    const userId = await ownerUser(sql, "select u.id from operations o join characters c on c.id = o.opened_by join users u on u.id = c.user_id where o.id = $1", job.entity_id);
    await resolveOperation(sql, { userId, operationId: job.entity_id });
    return;
  }
  if (job.job_type === "production") {
    const userId = await ownerUser(
      sql,
      `select u.id from production_jobs j
       join businesses b on b.id = j.business_id
       join characters c on c.id = b.owner_character_id
       join users u on u.id = c.user_id
       where j.id = $1`,
      job.entity_id,
    );
    await completeProduction(sql, { userId, jobId: job.entity_id });
    return;
  }
  if (job.job_type === "shipment") {
    const userId = await ownerUser(
      sql,
      `select u.id from shipments s
       join characters c on c.id = case
         when s.holder_kind = 'character' then s.holder_id
         else (select owner_character_id from businesses where id = s.holder_id)
       end
       join users u on u.id = c.user_id
       where s.id = $1`,
      job.entity_id,
    );
    const result = await deliverShipment(sql, { userId, shipmentId: job.entity_id });
    if (result === "waiting") throw new Error("The shipment is not ready.");
    return;
  }
  if (job.job_type === "delivery") {
    const userId = await ownerUser(
      sql,
      `select u.id from delivery_contracts d
       join characters c on c.id = d.carrier_character_id
       join users u on u.id = c.user_id
       where d.id = $1`,
      job.entity_id,
    );
    await resolveDelivery(sql, { userId, contractId: job.entity_id });
    return;
  }
  if (job.job_type === "delivery_expire") await expireAvailableDelivery(sql, job.entity_id);
  if (job.job_type === "journey") {
    const result = await settleJourney(sql, job.entity_id);
    if (result === "waiting") throw new Error("The journey has not arrived.");
    return;
  }
  if (job.job_type === "election") {
    const result = await settleElection(sql, job.entity_id);
    if (result === "pending") throw new Error("Voting is still open.");
  }
  if (job.job_type === "bill") {
    const result = await settleBill(sql, job.entity_id);
    if (result === "pending") throw new Error("Voting is still open.");
  }
  if (job.job_type === "city_contest") {
    const result = await settleCityContest(sql, job.entity_id);
    if (result === "pending") throw new Error("The contest is still open.");
  }
}

async function ownerUser(sql: Sql, text: string, entityId: string): Promise<string> {
  const rows = await sql.query<{ id: string }>(text, [entityId]);
  if (!rows[0]) throw new Error("The scheduled actor no longer exists.");
  return rows[0].id;
}

async function sweep(sql: Sql): Promise<number> {
  const batch = await rule(sql, "sim_batch");
  await expireDueListings(sql);
  const invites = await sql.query<{ id: string }>(
    `update organization_invitations set status = 'expired'
     where id in (
       select id from organization_invitations where status = 'pending' and expires_at <= now() limit $1
     )
     returning id`,
    [batch],
  );
  await sql.query(
    `update organization_relations
     set proposal = null, proposed_by = null, proposal_expires = null, updated_at = now()
     where proposal is not null and proposal_expires <= now()`,
  );
  const decay = await rule(sql, "org_heat_decay");
  const seconds = await rule(sql, "heat_decay_seconds");
  const steps = await rule(sql, "sim_catchup_steps");
  const cooled = await sql.query<{ character_id: string }>(
    `update character_underworld
     set heat = greatest(0, heat - $1 * least($2, greatest(1, floor(extract(epoch from (now() - coalesce(heat_decayed_at, updated_at))) / $3)::int))),
         heat_decayed_at = now(),
         updated_at = now()
     where character_id in (
       select character_id from character_underworld
       where heat > 0 and (heat_decayed_at is null or heat_decayed_at <= now() - ($3 * interval '1 second'))
       limit $4
     )
     returning character_id`,
    [decay, steps, seconds, batch],
  );
  return invites.length + cooled.length;
}

export async function currencyFlows(sql: Sql) {
  return sql.query<{ reason: string; direction: string; total: number }>(
    `select reason,
            case when from_kind = 'system' then 'created' when to_kind = 'system' then 'removed' else 'transferred' end as direction,
            coalesce(sum(amount), 0)::int as total
     from ledger_entries
     group by reason, 2
     order by total desc
     limit 20`,
  );
}

export async function activeWorldEvents(sql: Sql) {
  return sql.query<{ title: string; detail: string; endsAt: string }>(
    `select title, detail, ends_at as "endsAt"
     from world_events where status = 'active' and ends_at > now()
     order by ends_at limit 5`,
  );
}
