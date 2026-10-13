import { redirect } from "next/navigation";
import { MapExplorer } from "@/components/map/MapExplorer";
import { getCurrentUser } from "@/lib/auth/session";
import { getSql } from "@/lib/db";
import { getCharacterLocation, hasGeography, listCountries, startingCities } from "@/lib/geo/queries";
import { loadTravel } from "@/lib/travel/service";

export default async function MapPage({ searchParams }: { searchParams: Promise<{ country?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const sql = await getSql();
  if (!(await hasGeography(sql))) {
    return <p>Import geography with <code>npm run db:import</code> before opening the map.</p>;
  }
  const countries = await listCountries(sql);
  const travel = user.characterId ? await loadTravel(sql, user.id) : null;
  const location = user.characterId ? await getCharacterLocation(sql, user.id) : null;
  const requested = (await searchParams).country?.trim().toUpperCase() ?? "";
  const requestedCountry = /^[A-Z]{2}$/.test(requested) ? countries.find((country) => country.iso2 === requested) : undefined;
  const iso2 = requestedCountry?.iso2 ?? location?.city.countryIso2 ?? null;
  const cities = iso2 ? await startingCities(sql, iso2) : [];
  const initialCityId = requestedCountry && requestedCountry.iso2 !== location?.city.countryIso2 ? null : location?.city.id ?? null;
  return (
    <section className="h-full min-h-0">
      <h1 className="sr-only">World map</h1>
      <MapExplorer countries={countries} initialCities={cities} initialIso2={iso2} initialCityId={initialCityId} travel={travel} />
    </section>
  );
}
