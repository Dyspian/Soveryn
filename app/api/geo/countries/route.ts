import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { countryBoundaries } from "@/lib/geo/queries";
import { ensureDatabase } from "@/lib/ready";

export async function GET() {
  await ensureDatabase();
  const sql = await getSql();
  return NextResponse.json(await countryBoundaries(sql));
}
