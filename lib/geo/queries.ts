import type { Sql } from "@/lib/db";
import { featureLabel, populationLabel } from "@/lib/geo/format";

export type CountrySummary = {
  iso2: string;
  iso3: string;
  name: string;
  capitalName: string | null;
  population: number | null;
  populationQuality: string;
  populationSourceToken: string | null;
  startingCityTarget: number;
};

export type CityRecord = {
  id: string;
  geonameId: number;
  name: string;
  asciiName: string;
  latitude: number;
  longitude: number;
  featureCode: string;
  featureLabel: string;
  admin1Code: string | null;
  population: number | null;
  populationLabel: string;
  populationQuality: string;
  sourceModifiedOn: string | null;
  countryIso2: string;
  countryName: string;
  startingStatus: string | null;
  capacity: number | null;
  designNote: string | null;
  logistics: number | null;
  industry: number | null;
  commerce: number | null;
  government: number | null;
  energy: number | null;
  strategic: number | null;
};

type CityRow = {
  id: string;
  geoname_id: number | string;
  name: string;
  ascii_name: string;
  latitude: number | string;
  longitude: number | string;
  feature_code: string;
  admin1_code: string | null;
  population: number | string | null;
  population_quality: string;
  population_source_token: string | null;
  source_modified_on: string | Date | null;
  iso2: string;
  country_name: string;
  starting_status: string | null;
  capacity: number | string | null;
  design_note: string | null;
  logistics: number | null;
  industry: number | null;
  commerce: number | null;
  government: number | null;
  energy: number | null;
  strategic: number | null;
};

const CITY_SELECT = `
  select p.id, p.geoname_id, p.name, p.ascii_name, p.latitude, p.longitude, p.feature_code,
         p.admin1_code, p.population, p.population_quality, p.population_source_token, p.source_modified_on,
         c.iso2, c.name as country_name, s.status as starting_status, s.capacity,
         g.design_note, g.logistics, g.industry, g.commerce, g.government, g.energy, g.strategic
  from places p
  join countries c on c.id = p.country_id
  left join starting_locations s on s.place_id = p.id
  left join city_game_attributes g on g.place_id = p.id
`;

function mapCity(row: CityRow): CityRecord {
  const population = row.population == null ? null : Number(row.population);
  const modified =
    row.source_modified_on == null
      ? null
      : row.source_modified_on instanceof Date
        ? row.source_modified_on.toISOString().slice(0, 10)
        : String(row.source_modified_on).slice(0, 10);
  return {
    id: row.id,
    geonameId: Number(row.geoname_id),
    name: row.name,
    asciiName: row.ascii_name,
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    featureCode: row.feature_code,
    featureLabel: featureLabel(row.feature_code),
    admin1Code: row.admin1_code,
    population,
    populationLabel: populationLabel(population, row.population_quality, row.population_source_token),
    populationQuality: row.population_quality,
    sourceModifiedOn: modified,
    countryIso2: row.iso2,
    countryName: row.country_name,
    startingStatus: row.starting_status,
    capacity: row.capacity == null ? null : Number(row.capacity),
    designNote: row.design_note,
    logistics: row.logistics,
    industry: row.industry,
    commerce: row.commerce,
    government: row.government,
    energy: row.energy,
    strategic: row.strategic,
  };
}

export async function listCountries(sql: Sql): Promise<CountrySummary[]> {
  const rows = await sql.query<{
    iso2: string;
    iso3: string;
    name: string;
    capital_name: string | null;
    population: number | string | null;
    population_quality: string;
    population_source_token: string | null;
    starting_city_target: number;
  }>(
    `select iso2, iso3, name, capital_name, population, population_quality, population_source_token, starting_city_target
     from countries
     order by name`,
  );
  return rows.map((row) => ({
    iso2: row.iso2,
    iso3: row.iso3,
    name: row.name,
    capitalName: row.capital_name,
    population: row.population == null ? null : Number(row.population),
    populationQuality: row.population_quality,
    populationSourceToken: row.population_source_token,
    startingCityTarget: Number(row.starting_city_target),
  }));
}

export async function hasGeography(sql: Sql): Promise<boolean> {
  const rows = await sql.query<{ count: number }>("select count(*)::int as count from countries");
  return Number(rows[0]?.count ?? 0) > 0;
}

export async function startingCities(sql: Sql, iso2: string): Promise<CityRecord[]> {
  const rows = await sql.query<CityRow>(
    `${CITY_SELECT}
     where c.iso2 = $1 and s.place_id is not null
     order by s.status = 'open' desc, p.population desc nulls last, p.name`,
    [iso2.toUpperCase()],
  );
  return rows.map(mapCity);
}

export type PlaceSearch = {
  countries: CountrySummary[];
  cities: CityRecord[];
  nextOffset: number | null;
};

export async function searchPlaces(sql: Sql, query: string, offset = 0, pageSize = 25): Promise<PlaceSearch> {
  const trimmed = query.trim();
  const safeOffset = Number.isInteger(offset) && offset > 0 ? offset : 0;
  const safePageSize = Number.isInteger(pageSize) && pageSize > 0 ? Math.min(pageSize, 50) : 25;
  if (trimmed.length < 2) return { countries: [], cities: [], nextOffset: null };
  const pattern = `%${trimmed.replace(/[\\%_]/g, (character) => `\\${character}`)}%`;
  const countries =
    safeOffset === 0
      ? await sql.query<{
          iso2: string;
          iso3: string;
          name: string;
          capital_name: string | null;
          population: number | string | null;
          population_quality: string;
          population_source_token: string | null;
          starting_city_target: number;
        }>(
          `select iso2, iso3, name, capital_name, population, population_quality, population_source_token, starting_city_target
           from countries
           where name ilike $1 escape '\\' or iso2 ilike $1 escape '\\'
           order by name
           limit 10`,
          [pattern],
        )
      : [];
  const cities = await sql.query<CityRow>(
    `${CITY_SELECT}
     where s.place_id is not null
       and (
         p.name ilike $1 escape '\\'
         or p.ascii_name ilike $1 escape '\\'
         or coalesce(p.alternate_names, '') ilike $1 escape '\\'
         or c.name ilike $1 escape '\\'
       )
     order by p.population desc nulls last, p.name
     limit $2 offset $3`,
    [pattern, safePageSize + 1, safeOffset],
  );
  const page = cities.slice(0, safePageSize).map(mapCity);
  return {
    countries: countries.map((row) => ({
      iso2: row.iso2,
      iso3: row.iso3,
      name: row.name,
      capitalName: row.capital_name,
      population: row.population == null ? null : Number(row.population),
      populationQuality: row.population_quality,
      populationSourceToken: row.population_source_token,
      startingCityTarget: Number(row.starting_city_target),
    })),
    cities: page,
    nextOffset: cities.length > safePageSize ? safeOffset + page.length : null,
  };
}

export type BoundaryCollection = {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    properties: { iso2: string; name: string };
    geometry: unknown;
  }>;
};

export async function countryBoundaries(sql: Sql): Promise<BoundaryCollection> {
  const rows = await sql.query<{ iso2: string; name: string; boundary_geojson: string | null }>(
    "select iso2, name, boundary_geojson from countries where boundary_geojson is not null",
  );
  return {
    type: "FeatureCollection",
    features: rows.map((row) => ({
      type: "Feature" as const,
      properties: { iso2: row.iso2, name: row.name },
      geometry: JSON.parse(row.boundary_geojson ?? "null"),
    })),
  };
}

export type MapPointCollection = {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    properties: { id: string; name: string; iso2: string; status: string };
    geometry: { type: "Point"; coordinates: [number, number] };
  }>;
};

export async function startingCityCollection(sql: Sql): Promise<MapPointCollection> {
  const rows = await sql.query<{
    id: string;
    name: string;
    latitude: number | string;
    longitude: number | string;
    iso2: string;
    status: string;
  }>(
    `select p.id, p.name, p.latitude, p.longitude, c.iso2, s.status
     from starting_locations s
     join places p on p.id = s.place_id
     join countries c on c.id = p.country_id`,
  );
  return {
    type: "FeatureCollection",
    features: rows.map((row) => ({
      type: "Feature" as const,
      properties: { id: row.id, name: row.name, iso2: row.iso2, status: row.status },
      geometry: { type: "Point" as const, coordinates: [Number(row.longitude), Number(row.latitude)] },
    })),
  };
}

export async function getPlace(sql: Sql, id: string): Promise<CityRecord | null> {
  const rows = await sql.query<CityRow>(`${CITY_SELECT} where p.id = $1`, [id]);
  const row = rows[0];
  return row ? mapCity(row) : null;
}

export async function placesInBbox(
  sql: Sql,
  bounds: { west: number; south: number; east: number; north: number },
): Promise<CityRecord[]> {
  const longitudeClause =
    bounds.west <= bounds.east
      ? "p.longitude between $1 and $2"
      : "(p.longitude >= $1 or p.longitude <= $2)";
  const rows = await sql.query<CityRow>(
    `${CITY_SELECT}
     where ${longitudeClause}
       and p.latitude between $3 and $4
       and s.place_id is null
     order by p.population desc nulls last
     limit 200`,
    [bounds.west, bounds.east, bounds.south, bounds.north],
  );
  return rows.map(mapCity);
}

export async function getPublicCharacter(sql: Sql, username: string) {
  const rows = await sql.query<
    CityRow & {
      username: string;
      display_name: string | null;
      biography: string | null;
      portrait_key: string;
      level: number;
      specialization: string;
    }
  >(
    `${CITY_SELECT.replace("select p.id", "select c2.username, c2.display_name, c2.biography, c2.portrait_key, c2.level, c2.specialization, p.id")}
     join characters c2 on c2.place_id = p.id
     where lower(c2.username) = lower($1)`,
    [username],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    username: row.username,
    displayName: row.display_name,
    biography: row.biography,
    portraitKey: row.portrait_key,
    level: Number(row.level),
    specialization: row.specialization,
    city: mapCity(row),
  };
}

export async function getCharacterLocation(sql: Sql, userId: string) {
  const rows = await sql.query<
    CityRow & {
      username: string;
      display_name: string | null;
      biography: string | null;
      portrait_key: string;
      character_id: string;
    }
  >(
    `${CITY_SELECT.replace("select p.id", "select c2.id as character_id, c2.username, c2.display_name, c2.biography, c2.portrait_key, p.id")}
     join characters c2 on c2.place_id = p.id
     where c2.user_id = $1`,
    [userId],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    characterId: row.character_id,
    username: row.username,
    displayName: row.display_name,
    biography: row.biography,
    portraitKey: row.portrait_key,
    city: mapCity(row),
  };
}
