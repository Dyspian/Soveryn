"use client";

import { useActionState, useState } from "react";
import { foundBusinessAction } from "@/lib/actions/economy";
import type { ActionResult } from "@/lib/actions/account";
import type { CityRecord, CountrySummary } from "@/lib/geo/queries";

export function FoundBusinessForm({
  countries,
  categories,
}: {
  countries: CountrySummary[];
  categories: { id: string; name: string; startupCost: number; guidance: string }[];
}) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(foundBusinessAction, null);
  const [key] = useState(() => crypto.randomUUID());
  const [cities, setCities] = useState<CityRecord[]>([]);
  const [status, setStatus] = useState("");
  const [categoryId, setCategoryId] = useState(categories.find((category) => category.id === "trade")?.id ?? categories[0]?.id ?? "trade");
  const selected = categories.find((category) => category.id === categoryId) ?? categories[0];

  async function loadCities(iso2: string) {
    setStatus("Loading starting cities…");
    const response = await fetch(`/api/geo/starting-cities?iso2=${iso2}`);
    if (!response.ok) {
      setCities([]);
      setStatus("Those cities could not be loaded.");
      return;
    }
    const body = (await response.json()) as CityRecord[];
    setCities(body.filter((city) => city.startingStatus !== "disabled"));
    setStatus("");
  }

  return (
    <form action={action} className="panel space-y-3">
      <h2 className="section-title">Found a business</h2>
      <p className="text-sm text-muted">
        The startup fee is charged from your character. The registered city is the business location in the game, not a real-world company address. After it opens, you or a hired worker earns the result described for the category by working a shift.
      </p>
      {selected ? <p className="text-sm text-muted">{selected.guidance}</p> : null}
      {state && !state.ok ? <p className="text-sm text-danger" role="alert">{state.error}</p> : null}
      <input type="hidden" name="idempotencyKey" value={key} />
      <label className="block text-sm">
        Name
        <input name="name" required minLength={3} maxLength={40} className="field" />
      </label>
      <label className="block text-sm">
        Description
        <textarea name="description" maxLength={400} className="field" rows={3} />
      </label>
      <label className="block text-sm">
        Category
        <select name="category" required className="field" value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name} · startup {category.startupCost}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm">
        Country
        <select className="field" defaultValue="" onChange={(event) => void loadCities(event.target.value)}>
          <option value="" disabled>
            Choose a country
          </option>
          {countries.map((country) => (
            <option key={country.iso2} value={country.iso2}>
              {country.name}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm">
        Starting city
        <select name="placeId" required className="field" defaultValue="">
          <option value="" disabled>
            Choose a city
          </option>
          {cities.map((city) => (
            <option key={city.id} value={city.id}>
              {city.name}
            </option>
          ))}
        </select>
      </label>
      {status ? <p className="text-sm text-muted">{status}</p> : null}
      <button disabled={pending} className="btn btn-primary">
        {pending ? "Founding…" : "Pay the startup fee and found it"}
      </button>
    </form>
  );
}
