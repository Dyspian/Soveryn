export type GeoPoint = { latitude: number; longitude: number };

/** Great-circle distance. This is not a road, sea, or air route. */
export function distanceKm(origin: GeoPoint, destination: GeoPoint): number {
  const toRad = (degrees: number) => (degrees * Math.PI) / 180;
  const earth = 6371;
  const lat = toRad(destination.latitude - origin.latitude);
  const lon = toRad(destination.longitude - origin.longitude);
  const a =
    Math.sin(lat / 2) ** 2 +
    Math.cos(toRad(origin.latitude)) * Math.cos(toRad(destination.latitude)) * Math.sin(lon / 2) ** 2;
  return earth * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function simulatedTransit(distance: number, rules: { per100km: number; minimum: number }): number {
  const scaled = Math.ceil(distance / 100) * rules.per100km;
  return Math.max(rules.minimum, scaled);
}
