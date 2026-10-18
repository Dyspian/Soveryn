import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { consumeRateLimit, RateLimitError } from "@/lib/auth/rate-limit";
import { getSql } from "@/lib/db";
import { ensureDatabase } from "@/lib/ready";
import { loadWorldIntelligence } from "@/lib/site/intelligence";

export async function GET() {
  try {
    await ensureDatabase();
    const sql = await getSql();
    const headerStore = await headers();
    const ip = headerStore.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
    await consumeRateLimit(sql, `site:world:${ip}`, 30, 10 * 60 * 1000);
    return NextResponse.json(await loadWorldIntelligence(sql));
  } catch (error) {
    if (error instanceof RateLimitError) {
      return NextResponse.json({ error: "Too many requests." }, { status: 429 });
    }
    return NextResponse.json({ error: "The world snapshot is unavailable." }, { status: 503 });
  }
}
