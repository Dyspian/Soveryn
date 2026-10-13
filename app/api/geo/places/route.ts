import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { getPlace, placesInBbox } from "@/lib/geo/queries";
import { ensureDatabase } from "@/lib/ready";

const PLACE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: Request) {
  await ensureDatabase();
  const params = new URL(request.url).searchParams;
  const sql = await getSql();
  const id = params.get("id");
  if (id) {
    if (!PLACE_ID.test(id)) return NextResponse.json({ error: "That place identifier is not valid." }, { status: 400 });
    const place = await getPlace(sql, id);
    if (!place) return NextResponse.json({ error: "That place is not in the geographic database." }, { status: 404 });
    return NextResponse.json(place);
  }
  const west = Number(params.get("west"));
  const south = Number(params.get("south"));
  const east = Number(params.get("east"));
  const north = Number(params.get("north"));
  if (![west, south, east, north].every((value) => Number.isFinite(value))) {
    return NextResponse.json({ error: "A map bounding box is required." }, { status: 400 });
  }
  if (south < -90 || north > 90 || south > north) {
    return NextResponse.json({ error: "That latitude range is not valid." }, { status: 400 });
  }
  const cities = await placesInBbox(sql, { west, south, east, north });
  return NextResponse.json({
    type: "FeatureCollection",
    features: cities.map((city) => ({
      type: "Feature",
      properties: { id: city.id, name: city.name, iso2: city.countryIso2 },
      geometry: { type: "Point", coordinates: [city.longitude, city.latitude] },
    })),
  });
}
