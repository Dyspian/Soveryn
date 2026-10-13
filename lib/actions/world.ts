"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/session";
import { withTransaction } from "@/lib/db";
import type { ActionResult } from "@/lib/actions/account";

export async function worldAdminAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") return { ok: false, error: "That action is not available." };
  const intent = String(formData.get("intent") ?? "");
  try {
    await withTransaction(async (sql) => {
      if (intent === "pause") {
        const paused = String(formData.get("paused") ?? "") === "yes" ? 1 : 0;
        await sql.query("update game_rules set amount = $1 where key = 'sim_paused'", [paused]);
        await sql.query(
          "insert into audit_events (actor_user_id, action, entity_type, payload) values ($1, 'world.pause', 'simulation', $2::jsonb)",
          [user.id, JSON.stringify({ paused })],
        );
        return;
      }
      if (intent === "retry") {
        const jobId = String(formData.get("jobId") ?? "");
        if (!/^[0-9a-f-]{36}$/i.test(jobId)) throw new Error("That job is not recognized.");
        const updated = await sql.query<{ id: string }>(
          `update world_jobs set status = 'retry', attempts = 0, run_at = now(), locked_until = null, last_error = null, updated_at = now()
           where id = $1 and status = 'failed' returning id`,
          [jobId],
        );
        if (updated.length === 0) throw new Error("That job is not waiting for review.");
        await sql.query(
          "insert into audit_events (actor_user_id, action, entity_type, entity_id) values ($1, 'world.retry', 'world_job', $2)",
          [user.id, jobId],
        );
        return;
      }
      throw new Error("That world action is not recognized.");
    });
    revalidatePath("/admin/world");
    return { ok: true, message: intent === "pause" ? "The tick setting was saved." : "The job was queued again." };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const safe =
      message === "That job is not recognized." ||
      message === "That job is not waiting for review." ||
      message === "That world action is not recognized.";
    return { ok: false, error: safe ? message : "The world action could not be completed." };
  }
}
