export type ReserveRow = {
  iso3: string;
  name: string;
  year: number;
  amount: number;
  quality: "reported" | "reported_zero";
};

/**
 * Keeps the latest year for each ISO3 code.
 * A blank amount is skipped. A source zero stays zero and is not treated as missing data.
 */
export function latestReserveRows(csv: string): ReserveRow[] {
  const lines = csv.trim().split(/\r?\n/);
  const header = lines[0]?.split(",") ?? [];
  if (header.length < 4 || header[1] !== "code" || header[2] !== "year") {
    throw new Error("The reserve file does not have entity, code, year, and value columns.");
  }
  const latest = new Map<string, ReserveRow>();
  for (const line of lines.slice(1)) {
    if (!line.trim()) continue;
    const [name, code, yearText, raw] = line.split(",");
    if (!code || code.length !== 3 || code === code.toLowerCase()) continue;
    const year = Number(yearText);
    if (!Number.isInteger(year)) continue;
    if (raw == null || raw.trim() === "") continue;
    const amount = Number(raw);
    if (!Number.isFinite(amount) || amount < 0) continue;
    const current = latest.get(code);
    if (current && current.year > year) continue;
    latest.set(code, {
      iso3: code,
      name: name ?? code,
      year,
      amount,
      quality: amount === 0 ? "reported_zero" : "reported",
    });
  }
  return [...latest.values()];
}
