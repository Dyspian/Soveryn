import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { startingCities, startingCityCollection } from "@/lib/geo/queries";
import { ensureDatabase } from "@/lib/ready";

export async function GET(request: Request) {
  await ensureDatabase();
  const params = new URL(request.url).searchParams;
  const sql = await getSql();
  if (params.get("view") === "map") {
    return NextResponse.json(await startingCityCollection(sql));
  }
  const iso2 = params.get("iso2")?.toUpperCase() ?? "";
  if (!/^[A-Z]{2}$/.test(iso2)) {
    return NextResponse.json({ error: "Choose a country code." }, { status: 400 });
  }
  return NextResponse.json(await startingCities(sql, iso2));
}
