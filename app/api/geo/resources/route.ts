import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { listResourceTypes, resourceOverview } from "@/lib/economy/queries";
import { ensureDatabase } from "@/lib/ready";

export async function GET(request: Request) {
  await ensureDatabase();
  const url = new URL(request.url);
  const type = url.searchParams.get("type") || undefined;
  const iso2 = url.searchParams.get("iso2") || undefined;
  if (type && !/^[a-z_]{2,40}$/.test(type)) return NextResponse.json({ error: "Unknown resource." }, { status: 400 });
  if (iso2 && !/^[A-Z]{2}$/.test(iso2)) return NextResponse.json({ error: "Unknown country." }, { status: 400 });
  const sql = await getSql();
  const [types, records] = await Promise.all([listResourceTypes(sql), resourceOverview(sql, iso2, type)]);
  const highlights = [
    ...new Set(
      records
        .filter((row) => row.metric === "proved_reserves" && row.quality === "reported" && Number(row.amount) > 0)
        .map((row) => row.iso2),
    ),
  ];
  return NextResponse.json({
    types,
    records,
    highlights,
    note: "Country totals from the import. No deposit coordinates are included.",
  });
}
