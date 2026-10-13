import { LAUNCH_COUNTRIES } from "@/data/launch-countries";
import type { Sql } from "@/lib/db";

export type LaunchCoverage = {
  countries: number;
  places: number;
  startingCities: number;
};

export async function assertLaunchCoverage(sql: Sql): Promise<LaunchCoverage> {
  const countries = await sql.query<{ iso2: string; starting_city_min: number; starting_city_max: number }>(
    "select iso2, starting_city_min, starting_city_max from countries order by iso2",
  );
  const expected = new Set(LAUNCH_COUNTRIES.map((country) => country.iso2));
  if (countries.length !== expected.size) {
    throw new Error(`Expected ${expected.size} countries and found ${countries.length}.`);
  }
  for (const country of countries) {
    if (!expected.has(country.iso2)) {
      throw new Error(`Unexpected country ${country.iso2} in the launch set.`);
    }
  }

  const counts = await sql.query<{ iso2: string; starting_cities: number }>(
    `select c.iso2, count(s.place_id)::int as starting_cities
     from countries c
     left join places p on p.country_id = c.id
     left join starting_locations s on s.place_id = p.id
     group by c.iso2`,
  );
  let startingCities = 0;
  for (const row of counts) {
    const config = LAUNCH_COUNTRIES.find((country) => country.iso2 === row.iso2);
    const count = Number(row.starting_cities);
    startingCities += count;
    if (!config || count < config.min || count > config.max) {
      throw new Error(`${row.iso2} has ${count} starting cities, outside its configured range.`);
    }
  }
  if (startingCities < 300 || startingCities > 500) {
    throw new Error(`Starting city total ${startingCities} is outside 300–500.`);
  }

  const mismatched = await sql.query<{ count: number }>(
    `select count(*)::int as count
     from starting_locations s
     join places p on p.id = s.place_id
     join countries c on c.id = p.country_id
     where p.country_id <> c.id`,
  );
  if (Number(mismatched[0]?.count ?? 0) > 0) {
    throw new Error("A starting city is stored against the wrong country.");
  }

  const placeCount = await sql.query<{ count: number }>("select count(*)::int as count from places");
  return {
    countries: countries.length,
    places: Number(placeCount[0]?.count ?? 0),
    startingCities,
  };
}
