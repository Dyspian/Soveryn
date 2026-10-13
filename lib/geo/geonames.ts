export type PopulationReading = {
  population: number | null;
  quality: "imported" | "population_absent" | "population_source_zero" | "population_unparseable";
};

/**
 * GeoNames often stores an empty field or the token "0" when a count was not
 * supplied. Those are not verified populations. The original token is kept on
 * the row so a source zero is not rewritten into a silent null without a trace.
 */
export function interpretPopulation(token: string | null | undefined): PopulationReading {
  const trimmed = (token ?? "").trim();
  if (trimmed === "") {
    return { population: null, quality: "population_absent" };
  }
  if (!/^\d+$/.test(trimmed)) {
    return { population: null, quality: "population_unparseable" };
  }
  const value = Number(trimmed);
  if (value === 0) {
    return { population: null, quality: "population_source_zero" };
  }
  if (!Number.isSafeInteger(value)) {
    return { population: null, quality: "population_unparseable" };
  }
  return { population: value, quality: "imported" };
}

export type ParsedPlace = {
  geonameId: number;
  name: string;
  asciiName: string;
  alternateNames: string | null;
  alternateNamesTruncated: boolean;
  latitude: number;
  longitude: number;
  featureClass: string;
  featureCode: string;
  countryCode: string;
  admin1Code: string | null;
  population: number | null;
  populationSourceToken: string;
  populationQuality: PopulationReading["quality"];
  elevationM: number | null;
  timezone: string | null;
  sourceModifiedOn: string | null;
};

const ALTERNATE_NAME_LIMIT = 8000;

export function parseGeonameLine(line: string): ParsedPlace | null {
  if (!line.trim()) return null;
  const columns = line.split("\t");
  if (columns.length < 19) return null;

  const latitude = Number(columns[4]);
  const longitude = Number(columns[5]);
  const geonameId = Number(columns[0]);
  if (!Number.isInteger(geonameId) || geonameId <= 0) return null;
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) return null;
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) return null;
  if (!columns[1] || !columns[8]) return null;

  const population = interpretPopulation(columns[14]);
  const elevationToken = columns[15]?.trim() ?? "";
  const elevation = /^-?\d+$/.test(elevationToken) ? Number(elevationToken) : null;
  const alternate = columns[3]?.trim() ?? "";
  const modified = columns[18]?.trim() ?? "";

  return {
    geonameId,
    name: columns[1],
    asciiName: columns[2] || columns[1],
    alternateNames: alternate ? alternate.slice(0, ALTERNATE_NAME_LIMIT) : null,
    alternateNamesTruncated: alternate.length > ALTERNATE_NAME_LIMIT,
    latitude,
    longitude,
    featureClass: columns[6] || "P",
    featureCode: columns[7] || "PPL",
    countryCode: columns[8],
    admin1Code: columns[10]?.trim() || null,
    population: population.population,
    populationSourceToken: (columns[14] ?? "").trim(),
    populationQuality: population.quality,
    elevationM: elevation,
    timezone: columns[17]?.trim() || null,
    sourceModifiedOn: /^\d{4}-\d{2}-\d{2}$/.test(modified) ? modified : null,
  };
}

export type ParsedCountry = {
  iso2: string;
  iso3: string;
  name: string;
  capitalName: string | null;
  continent: string | null;
  geonameId: number | null;
  areaSqKm: number | null;
  areaSourceToken: string;
  population: number | null;
  populationSourceToken: string;
  populationQuality: PopulationReading["quality"];
};

export function parseCountryInfoLine(line: string): ParsedCountry | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;
  const columns = line.split("\t");
  if (columns.length < 17) return null;
  const iso2 = columns[0]?.trim();
  const iso3 = columns[1]?.trim();
  if (!iso2 || iso2.length !== 2 || !iso3 || iso3.length !== 3) return null;

  const population = interpretPopulation(columns[7]);
  const areaToken = columns[6]?.trim() ?? "";
  const area = Number(areaToken);
  const geonameId = Number(columns[16]);

  return {
    iso2,
    iso3,
    name: columns[4]?.trim() || iso2,
    capitalName: columns[5]?.trim() || null,
    continent: columns[8]?.trim() || null,
    geonameId: Number.isInteger(geonameId) && geonameId > 0 ? geonameId : null,
    areaSqKm: Number.isFinite(area) && area > 0 ? area : null,
    areaSourceToken: areaToken,
    population: population.population,
    populationSourceToken: (columns[7] ?? "").trim(),
    populationQuality: population.quality,
  };
}
