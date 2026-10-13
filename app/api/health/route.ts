import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { ensureDatabase } from "@/lib/ready";

export async function GET() {
  try {
    await ensureDatabase();
    const sql = await getSql();
    await sql.query("select 1 as ok");
    const tick = await sql.query<{ lastFinished: string | null }>("select last_finished_at as \"lastFinished\" from simulation_ticks where id = 1");
    return NextResponse.json({ ok: true, database: "up", lastTick: tick[0]?.lastFinished ?? null });
  } catch {
    return NextResponse.json({ ok: false, database: "down" }, { status: 503 });
  }
}
