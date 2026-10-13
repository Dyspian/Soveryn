import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { ensureDatabase } from "@/lib/ready";

export async function GET() {
  await ensureDatabase();
  const sql = await getSql();
  const rows = await sql.query<{ id: string; name: string; latitude: number; longitude: number; iso2: string }>(
    `select p.id, p.name, p.latitude, p.longitude, c.iso2
     from places p
     join countries c on c.id = p.country_id
     where exists (select 1 from businesses b where b.place_id = p.id and b.status = 'active')
     order by p.name`,
  );
  return NextResponse.json({
    type: "FeatureCollection",
    features: rows.map((row) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [row.longitude, row.latitude] },
      properties: { id: row.id, name: row.name, iso2: row.iso2 },
    })),
    note:
      rows.length === 0
        ? "No active business is registered in a recorded city."
        : "Highlighted cities have an active game business. The mark is not a resource deposit.",
  });
}
