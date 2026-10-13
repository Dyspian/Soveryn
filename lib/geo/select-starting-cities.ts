const FEATURE_RANK: Record<string, number> = {
  PPLC: 0,
  PPLA: 1,
  PPLA2: 2,
  PPLA3: 3,
  PPLA4: 4,
  PPL: 5,
  PPLX: 6,
};

export type StartingCandidate = {
  population: number | null;
  featureCode: string;
  asciiName: string;
  geonameId: number;
  latitude: number;
  longitude: number;
};

const EARTH_RADIUS_KM = 6371;

function featureRank(code: string): number {
  return FEATURE_RANK[code] ?? 50;
}

function compareRelevance(a: StartingCandidate, b: StartingCandidate): number {
  const aKnown = a.population != null;
  const bKnown = b.population != null;
  if (aKnown !== bKnown) return aKnown ? -1 : 1;
  if (a.population != null && b.population != null && a.population !== b.population) {
    return b.population - a.population;
  }
  const featureDelta = featureRank(a.featureCode) - featureRank(b.featureCode);
  if (featureDelta !== 0) return featureDelta;
  const nameDelta = a.asciiName.localeCompare(b.asciiName);
  if (nameDelta !== 0) return nameDelta;
  return a.geonameId - b.geonameId;
}

function haversineKm(a: StartingCandidate, b: StartingCandidate): number {
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const latitudeA = toRadians(a.latitude);
  const latitudeB = toRadians(b.latitude);
  const latitudeDelta = latitudeB - latitudeA;
  const longitudeDelta = toRadians(b.longitude - a.longitude);
  const chord =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(latitudeA) * Math.cos(latitudeB) * Math.sin(longitudeDelta / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(chord)));
}

const SUBURB_KM = 15;

function distanceToSelected(candidate: StartingCandidate, selected: readonly StartingCandidate[]): number {
  if (selected.length === 0) return Infinity;
  let distance = Infinity;
  for (const place of selected) distance = Math.min(distance, haversineKm(candidate, place));
  return distance;
}

function farthest<T extends StartingCandidate>(candidates: T[], selected: T[]): T {
  let best = candidates[0];
  if (!best) throw new Error("A starting-city candidate is required.");
  let bestDistance = distanceToSelected(best, selected);
  for (const candidate of candidates.slice(1)) {
    const distance = distanceToSelected(candidate, selected);
    const distanceDelta = distance - bestDistance;
    if (distanceDelta > 0.001 || (Math.abs(distanceDelta) <= 0.001 && compareRelevance(candidate, best) < 0)) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * Picks a configured number of real places.
 * A GeoNames capital is kept. Most remaining slots follow reported population,
 * skipping a place within 15 km of one already chosen so a capital's suburbs
 * do not crowd out other cities. About a quarter of the slots then go to the
 * farthest remaining large places, so the set is not only the single biggest cluster.
 */
export function selectStartingPlaces<T extends StartingCandidate>(
  places: T[],
  target: number,
): { selected: T[]; shortfall: number } {
  if (target <= 0 || places.length === 0) {
    return { selected: [], shortfall: Math.max(0, target) };
  }

  const ranked = [...places].sort(compareRelevance);
  const poolSize = Math.min(ranked.length, Math.max(target * 4, target));
  const pool = ranked.slice(0, poolSize);
  const capital = ranked.find((place) => place.featureCode === "PPLC");
  if (capital && !pool.includes(capital)) pool.push(capital);

  const selected: T[] = [];
  if (capital && pool.includes(capital)) selected.push(capital);
  const spreadSlots = Math.max(1, Math.round(target / 4));
  const coreTarget = Math.min(pool.length, Math.max(selected.length, target - spreadSlots));

  for (const candidate of pool) {
    if (selected.length >= coreTarget) break;
    if (selected.includes(candidate)) continue;
    if (distanceToSelected(candidate, selected) >= SUBURB_KM) selected.push(candidate);
  }

  while (selected.length < Math.min(target, pool.length)) {
    const separated = pool.filter(
      (candidate) => !selected.includes(candidate) && distanceToSelected(candidate, selected) >= SUBURB_KM,
    );
    const remaining = separated.length > 0 ? separated : pool.filter((candidate) => !selected.includes(candidate));
    if (remaining.length === 0) break;
    selected.push(farthest(remaining, selected));
  }

  return {
    selected,
    shortfall: Math.max(0, target - selected.length),
  };
}
