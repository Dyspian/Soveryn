import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getSql } from "@/lib/db";
import { resourceOverview } from "@/lib/economy/queries";

export default async function ResourcesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const rows = await resourceOverview(await getSql());
  return (
    <section className="space-y-4">
      <div>
        <p className="kicker">Reference</p>
        <h1 className="page-title">Resource reference</h1>
        <p className="max-w-3xl text-sm text-muted">
          These rows are imported country statistics. They are not city deposits, and extraction in the game does not change them. A blank import means that resource has no loaded figure.
        </p>
      </div>
      {rows.length === 0 ? (
        <p className="text-muted">No resource statistics are loaded. Run npm run db:resources while the dev server is stopped.</p>
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
              {rows.map((row) => (
                <tr key={`${row.iso2}-${row.resourceType}-${row.metric}-${row.period}`} className="border-t border-line">
                  <td className="py-2 pr-3">{row.country}</td>
                  <td className="py-2 pr-3">{row.resourceName}</td>
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
