import { redirect } from "next/navigation";
import { EntityMark } from "@/components/game/EntityMark";
import { getCurrentUser } from "@/lib/auth/session";
import { getSql } from "@/lib/db";
import { listCountries } from "@/lib/geo/queries";
import { resourceOverview } from "@/lib/economy/queries";

export default async function ResourcesPage({ searchParams }: { searchParams: Promise<{ iso2?: string; q?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const query = await searchParams;
  const sql = await getSql();
  const iso2 = (query.iso2 ?? "").trim().toUpperCase();
  const needle = (query.q ?? "").trim().toLowerCase();
  const [rows, countries] = await Promise.all([
    resourceOverview(sql, iso2 || undefined),
    listCountries(sql),
  ]);
  const shown = needle
    ? rows.filter((row) => row.resourceName.toLowerCase().includes(needle) || row.country.toLowerCase().includes(needle))
    : rows;
  return (
    <section className="space-y-4">
      <div>
        <p className="kicker">Reference</p>
        <h1 className="page-title">Resource reference</h1>
        <p className="max-w-3xl text-sm text-muted">
          These rows are imported country statistics. They are not city deposits, and extraction in the game does not change them. A blank import means that resource has no loaded figure.
        </p>
      </div>
      <form className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-end" method="get">
        <label className="text-sm">
          Search
          <input name="q" defaultValue={query.q ?? ""} placeholder="Country or resource" className="field" type="search" />
        </label>
        <label className="text-sm">
          Country
          <select name="iso2" defaultValue={iso2} className="field" aria-label="Country">
            <option value="">All loaded countries</option>
            {countries.map((country) => (
              <option key={country.iso2} value={country.iso2}>
                {country.name}
              </option>
            ))}
          </select>
        </label>
        <button className="btn btn-secondary">Show records</button>
      </form>
      <p className="text-xs text-muted">{shown.length} {shown.length === 1 ? "row" : "rows"}</p>
      {shown.length === 0 ? (
        <p className="text-muted">
          {rows.length === 0
            ? "No resource statistics are loaded. Run npm run db:resources while the dev server is stopped."
            : "No resource statistics match this filter."}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[48rem] text-left text-sm">
            <thead className="text-muted">
              <tr>
                <th className="py-2 pr-3">Country</th>
                <th className="py-2 pr-3">Resource</th>
                <th className="py-2 pr-3">Metric</th>
                <th className="py-2 pr-3">Amount</th>
                <th className="py-2 pr-3">Period</th>
                <th className="py-2 pr-3">Level</th>
                <th className="py-2">Source</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((row) => (
                <tr key={`${row.iso2}-${row.resourceType}-${row.metric}-${row.period}`} className="border-t border-line">
                  <td className="py-2 pr-3">{row.country}</td>
                  <td className="py-2 pr-3">
                    <span className="inline-flex items-center gap-2">
                      <EntityMark kind="resource" id={row.resourceType} label={row.resourceName} size="sm" />
                      {row.resourceName}
                    </span>
                  </td>
                  <td className="py-2 pr-3">{row.metric.replaceAll("_", " ")}</td>
                  <td className="num py-2 pr-3">
                    {row.quality === "unreported" || row.amount == null ? "Unreported" : `${Number(row.amount).toLocaleString("en-US")} ${row.unit}`}
                    {row.quality === "reported_zero" ? " (source reports zero)" : ""}
                  </td>
                  <td className="py-2 pr-3">{row.period}</td>
                  <td className="py-2 pr-3">{row.level}</td>
                  <td className="py-2">{row.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
