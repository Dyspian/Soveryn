import { redirect } from "next/navigation";
import { updateStartingLocationAction } from "@/lib/actions/account";
import { getCurrentUser } from "@/lib/auth/session";
import { getSql } from "@/lib/db";
import { listCountries, startingCities } from "@/lib/geo/queries";

export default async function StartingLocationsAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ iso2?: string; error?: string; saved?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") redirect("/");
  const query = await searchParams;
  const sql = await getSql();
  const countries = await listCountries(sql);
  const iso2 = (query.iso2 ?? countries[0]?.iso2 ?? "").toUpperCase();
  const cities = iso2 ? await startingCities(sql, iso2) : [];

  return (
    <section>
      <p className="kicker">Administration</p>
      <h1 className="page-title">Starting cities</h1>
      <p className="mt-2 max-w-3xl text-sm text-muted">
        Open cities can be chosen by any number of new characters unless you set a capacity. Disabled, full,
        restricted, and event cities are stored but cannot be selected. This does not change geographic coordinates.
      </p>
      {query.saved ? <p className="mt-3 text-sm text-gold">Saved.</p> : null}
      {query.error ? <p className="mt-3 text-sm text-danger">The update was rejected. Check the capacity.</p> : null}
      <form className="mt-4" method="get">
        <label className="text-sm">
          Country
          <select name="iso2" defaultValue={iso2} className="field-inline ml-2">
            {countries.map((country) => (
              <option key={country.iso2} value={country.iso2}>
                {country.name}
              </option>
            ))}
          </select>
        </label>
        <button className="btn btn-secondary ml-2">Show</button>
      </form>
      <ul className="mt-6 space-y-3">
        {cities.map((city) => (
          <li key={city.id} className="panel">
            <form action={updateStartingLocationAction} className="flex flex-wrap items-end gap-3 text-sm">
              <input type="hidden" name="placeId" value={city.id} />
              <div className="min-w-48">
                <p className="font-medium">{city.name}</p>
                <p className="text-muted">{city.populationLabel}</p>
              </div>
              <label>
                Status
                <select name="status" defaultValue={city.startingStatus ?? "open"} className="field-inline mt-1 block">
                  {["open", "disabled", "full", "restricted", "event"].map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Capacity
                <input name="capacity" defaultValue={city.capacity ?? ""} placeholder="No limit" aria-label={`${city.name} capacity`} className="field-inline mt-1 block w-28" />
              </label>
              <button className="btn btn-primary">Save</button>
            </form>
          </li>
        ))}
      </ul>
    </section>
  );
}
