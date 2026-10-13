import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getSql } from "@/lib/db";
import { SPECIALIZATION_DETAILS, type Specialization } from "@/lib/progression/rules";
import { discoverCharacters } from "@/lib/social/connections";

const SPECIALIZATIONS = ["entrepreneur", "politician", "industrialist", "trader", "criminal", "security", "explorer", "generalist"] as const;

export default async function CharacterDirectoryPage({ searchParams }: { searchParams: Promise<{ q?: string; specialization?: string; page?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.characterId) redirect("/create");
  const query = await searchParams;
  const username = query.q ?? "";
  const specialization = query.specialization ?? "";
  const page = Math.max(0, Math.min(9, Math.floor(Number(query.page ?? "0")) || 0));
  const sql = await getSql();
  const rows = await discoverCharacters(sql, { viewerId: user.characterId, username, specialization, page });
  return (
    <section className="mx-auto max-w-2xl space-y-4">
      <div>
        <p className="kicker">People</p>
        <h1 className="page-title">Characters</h1>
        <p className="text-sm text-muted">Search uses the character name and specialization. A blocked contact is left out. The list does not include coordinates.</p>
      </div>
      <form className="flex flex-wrap items-end gap-2 text-sm" method="get">
        <label>
          Name
          <input name="q" defaultValue={username} className="field" placeholder="At least 2 letters" />
        </label>
        <label>
          Specialization
          <select name="specialization" defaultValue={specialization} className="field">
            <option value="">Any</option>
            {SPECIALIZATIONS.map((item) => (
              <option key={item} value={item}>{SPECIALIZATION_DETAILS[item as Specialization]?.title ?? item}</option>
            ))}
          </select>
        </label>
        <input type="hidden" name="page" value="0" />
        <button className="btn btn-secondary">Search</button>
      </form>
      {username.trim().length < 2 && specialization.length === 0 ? <p className="text-sm text-muted">Enter part of a name, or choose a specialization.</p> : null}
      {rows.length === 0 && (username.trim().length >= 2 || specialization.length > 0) ? <p className="text-sm text-muted">No character matches that search.</p> : null}
      <ul className="space-y-2">
        {rows.map((row) => (
          <li key={row.username} className="panel text-sm">
            <Link href={`/characters/${row.username}`} className="text-gold">@{row.username}</Link>
            <p className="text-muted">
              Level <span className="num">{row.level}</span> · {SPECIALIZATION_DETAILS[row.specialization as Specialization]?.title ?? row.specialization}
              {row.organization ? ` · ${row.organization}` : ""}
            </p>
          </li>
        ))}
      </ul>
      {page > 0 || rows.length === 20 ? (
        <p className="flex gap-3 text-sm">
          {page > 0 ? <Link className="text-gold" href={`/characters?q=${encodeURIComponent(username)}&specialization=${encodeURIComponent(specialization)}&page=${page - 1}`}>Previous</Link> : null}
          {rows.length === 20 ? <Link className="text-gold" href={`/characters?q=${encodeURIComponent(username)}&specialization=${encodeURIComponent(specialization)}&page=${page + 1}`}>Next</Link> : null}
        </p>
      ) : null}
    </section>
  );
}
