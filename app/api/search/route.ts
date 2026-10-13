import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { searchPlaces } from "@/lib/geo/queries";
import { ensureDatabase } from "@/lib/ready";

export async function GET(request: Request) {
  await ensureDatabase();
  const params = new URL(request.url).searchParams;
  const query = params.get("q") ?? "";
  const offsetText = params.get("offset");
  const offset = offsetText == null || offsetText === "" ? 0 : Number(offsetText);
  if (!Number.isInteger(offset) || offset < 0 || offset > 1000) {
    return NextResponse.json({ error: "Offset is not valid." }, { status: 400 });
  }
  const sql = await getSql();
  return NextResponse.json(await searchPlaces(sql, query, offset));
}
