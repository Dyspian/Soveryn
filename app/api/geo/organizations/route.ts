import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { ensureDatabase } from "@/lib/ready";

export async function GET() {
  await ensureDatabase();
  const sql = await getSql();
  const rows = await sql.query<{ id: string; name: string; tag: string; orgType: string; latitude: number; longitude: number; city: string; iso2: string }>(
    `select o.id, o.name, o.tag, o.org_type as "orgType", p.latitude, p.longitude, p.name as city, c.iso2
     from organizations o
     join places p on p.id = o.headquarters_place_id
     join countries c on c.id = p.country_id
     where o.status = 'active' and o.visibility = 'public'
     order by o.name`,
  );
  return NextResponse.json({
    type: "FeatureCollection",
    features: rows.map((row) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [row.longitude, row.latitude] },
      properties: { id: row.id, name: row.name, tag: row.tag, orgType: row.orgType, city: row.city, iso2: row.iso2 },
    })),
    note:
      rows.length === 0
        ? "No public organization has a headquarters."
        : "Highlighted cities have a public organization headquarters. This is game state, not territorial control, and private operations are not shown.",
  });
}
