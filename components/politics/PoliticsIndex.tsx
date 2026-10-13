"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

export function PoliticsIndex({
  rows,
}: {
  rows: { iso2: string; name: string; templateName: string | null; leader: string | null }[];
}) {
  const [query, setQuery] = useState("");
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) => row.name.toLowerCase().includes(needle) || row.iso2.toLowerCase().includes(needle));
  }, [rows, query]);

  return (
    <div className="space-y-4">
      <label className="block max-w-sm text-sm">
        Find a country
        <input className="field" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name or code" type="search" />
      </label>
      {rows.length === 0 ? <p className="text-sm text-muted">No countries are loaded.</p> : null}
      {rows.length > 0 && visible.length === 0 ? <p className="text-sm text-muted">No country matches that search.</p> : null}
      <ul className="space-y-2">
        {visible.map((row) => (
          <li key={row.iso2} className="panel text-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <Link href={`/politics/${row.iso2}`} className="font-serif text-xl text-gold">
                {row.name}
              </Link>
              <span className="text-muted">{row.iso2}</span>
            </div>
            <p className="mt-1 text-muted">{row.templateName ? `Game constitution: ${row.templateName}` : "No game constitution"}</p>
            <p>{row.leader ? `Current game executive: ${row.leader}` : "No game executive"}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
