export type LngLat = [number, number];

export type TerritoryFrame =
  | { mode: "bounds"; west: number; south: number; east: number; north: number }
  | { mode: "center"; longitude: number; latitude: number; zoom: number };

export function territoryFrame(geometry: unknown): TerritoryFrame | null {
  const points = coordinatesOf(geometry);
  if (points.length === 0) return null;
  let south = 90;
  let north = -90;
  for (const [, latitude] of points) {
    if (latitude < south) south = latitude;
    if (latitude > north) north = latitude;
  }
  const longitudes = points.map(([longitude]) => longitude);
  const rawWest = Math.min(...longitudes);
  const rawEast = Math.max(...longitudes);
  if (rawEast - rawWest <= 180) {
    return { mode: "bounds", west: rawWest, south, east: rawEast, north };
  }
  const shifted = longitudes.map((longitude) => (longitude < 0 ? longitude + 360 : longitude));
  const shiftWest = Math.min(...shifted);
  const shiftEast = Math.max(...shifted);
  const latitude = (south + north) / 2;
  if (shiftEast - shiftWest <= 180) {
    return {
      mode: "center",
      longitude: normalizeLongitude((shiftWest + shiftEast) / 2),
      latitude,
      zoom: zoomForSpan(Math.max(shiftEast - shiftWest, north - south)),
    };
  }
  return { mode: "center", longitude: normalizeLongitude(longitudes[0] ?? 0), latitude, zoom: 2 };
}

export function coordinatesOf(geometry: unknown): LngLat[] {
  const points: LngLat[] = [];
  collect(geometry, points);
  return points;
}

function collect(geometry: unknown, points: LngLat[]) {
  if (!geometry || typeof geometry !== "object") return;
  const record = geometry as { type?: string; coordinates?: unknown; geometries?: unknown[] };
  if (record.type === "GeometryCollection" && Array.isArray(record.geometries)) {
    for (const child of record.geometries) collect(child, points);
    return;
  }
  walk(record.coordinates, points);
}

function walk(value: unknown, points: LngLat[]) {
  if (!Array.isArray(value)) return;
  if (value.length >= 2 && typeof value[0] === "number" && typeof value[1] === "number") {
    const longitude = value[0];
    const latitude = value[1];
    if (Number.isFinite(longitude) && Number.isFinite(latitude) && latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180) {
      points.push([longitude, latitude]);
    }
    return;
  }
  for (const child of value) walk(child, points);
}

function normalizeLongitude(value: number) {
  let longitude = value;
  while (longitude > 180) longitude -= 360;
  while (longitude < -180) longitude += 360;
  return longitude;
}

function zoomForSpan(span: number) {
  if (!Number.isFinite(span) || span <= 0) return 6;
  return Math.min(6, Math.max(1.25, Math.round(Math.log2(360 / span) * 10) / 10));
}
