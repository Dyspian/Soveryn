"use client";

import { useActionState, useMemo, useState } from "react";
import { Portrait } from "@/components/brand/Portrait";
import { WorldMap, type MapFocus } from "@/components/map/WorldMap";
import { createCharacterAction, type ActionResult } from "@/lib/actions/account";
import { populationLabel } from "@/lib/geo/format";
import type { CityRecord, CountrySummary } from "@/lib/geo/queries";
import { SPECIALIZATION_DETAILS, SPECIALIZATIONS, type Specialization } from "@/lib/progression/rules";
import { PORTRAIT_KEYS } from "@/lib/validation";

const STEPS = ["Identity", "Background", "Specialization", "Review"];

export function CreateCharacterForm({ countries }: { countries: CountrySummary[] }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(createCharacterAction, null);
  const [step, setStep] = useState(0);
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [biography, setBiography] = useState("");
  const [portraitKey, setPortraitKey] = useState<(typeof PORTRAIT_KEYS)[number]>("mark-1");
  const [iso2, setIso2] = useState<string | null>(null);
  const [cities, setCities] = useState<CityRecord[]>([]);
  const [cityId, setCityId] = useState<string | null>(null);
  const [focus, setFocus] = useState<MapFocus | null>(null);
  const [filter, setFilter] = useState("");
  const [listStatus, setListStatus] = useState("");
  const [specialization, setSpecialization] = useState<Specialization>("generalist");
  const [confirmed, setConfirmed] = useState(false);

  async function chooseCountry(nextIso: string, nextFocus: MapFocus | null = null) {
    setIso2(nextIso);
    setCityId(nextFocus?.id ?? null);
    setFocus(nextFocus);
    setListStatus("Loading starting cities…");
    const response = await fetch(`/api/geo/starting-cities?iso2=${nextIso}`);
    if (!response.ok) {
      setCities([]);
      setListStatus("Starting cities could not be loaded.");
      return;
    }
    const body = (await response.json()) as CityRecord[];
    setCities(body);
    setListStatus(body.length === 0 ? "No starting cities are configured for this country." : "");
  }

  const visibleCities = useMemo(() => {
    const query = filter.trim().toLowerCase();
    if (!query) return cities;
    return cities.filter((city) => city.name.toLowerCase().includes(query) || city.asciiName.toLowerCase().includes(query));
  }, [cities, filter]);

  const selected = cities.find((city) => city.id === cityId) ?? null;
  const country = countries.find((item) => item.iso2 === iso2) ?? null;
  const identityReady = /^[A-Za-z0-9_]{3,20}$/.test(username);
  const backgroundReady = selected?.startingStatus === "open";

  return (
    <div className="space-y-6">
      <ol className="flex flex-wrap gap-3 text-sm">
        {STEPS.map((label, index) => (
          <li key={label} className={index === step ? "text-gold" : "text-muted"}>
            {index + 1}. {label}
          </li>
        ))}
      </ol>

      {step === 0 ? (
        <div className="max-w-xl space-y-4">
          <label className="block text-sm">
            Username
            <input value={username} onChange={(event) => setUsername(event.target.value)} required minLength={3} maxLength={20} className="field" />
          </label>
          <label className="block text-sm">
            Display name <span className="text-muted">(optional)</span>
            <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={40} className="field" />
          </label>
          <label className="block text-sm">
            Biography <span className="text-muted">(optional)</span>
            <textarea value={biography} onChange={(event) => setBiography(event.target.value)} maxLength={2000} rows={4} className="field" />
          </label>
          <fieldset>
            <legend className="text-sm">Portrait</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {PORTRAIT_KEYS.map((key) => (
                <label key={key} className={`rounded border p-1 ${portraitKey === key ? "border-gold" : "border-line"}`}>
                  <input className="sr-only" type="radio" name="portrait-choice" value={key} checked={portraitKey === key} onChange={() => setPortraitKey(key)} />
                  <Portrait portraitKey={key} className="h-12 w-12" />
                </label>
              ))}
            </div>
          </fieldset>
          <button type="button" disabled={!identityReady} onClick={() => setStep(1)} className="btn btn-primary">
            Continue
          </button>
        </div>
      ) : null}

      {step === 1 ? (
        <div className="grid gap-6 lg:grid-cols-[22rem_1fr]">
          <div className="space-y-4">
            <p className="text-sm text-muted">The starting city is the character's first location in the game world. It is not a claim about your real-world identity.</p>
            <label className="block text-sm">
              Country
              <select className="field" value={iso2 ?? ""} onChange={(event) => void chooseCountry(event.target.value)}>
                <option value="" disabled>
                  Choose a country
                </option>
                {countries.map((item) => (
                  <option key={item.iso2} value={item.iso2}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              Search starting cities
              <input value={filter} onChange={(event) => setFilter(event.target.value)} className="field" placeholder="City name" aria-label="City name" />
            </label>
            <div className="max-h-64 space-y-2 overflow-auto">
              {visibleCities.map((city) => {
                const open = city.startingStatus === "open";
                return (
                  <button
                    key={city.id}
                    type="button"
                    disabled={!open}
                    onClick={() => {
                      setCityId(city.id);
                      setFocus({ id: city.id, latitude: city.latitude, longitude: city.longitude });
                    }}
                    className={`block w-full rounded border px-3 py-2 text-left text-sm ${cityId === city.id ? "border-gold" : "border-line"} disabled:text-muted`}
                  >
                    <span className="block">{city.name}</span>
                    <span className="text-muted">
                      {city.populationLabel} · {city.featureLabel}
                      {open ? "" : ` · ${city.startingStatus}`}
                    </span>
                  </button>
                );
              })}
            </div>
            {iso2 && !listStatus && visibleCities.length === 0 ? <p className="text-sm text-muted">No starting cities match that name.</p> : null}
            {listStatus ? <p className="text-sm text-muted">{listStatus}</p> : null}
            {selected ? <CityFacts city={selected} /> : <p className="text-sm text-muted">Select a starting city to see its record.</p>}
            <div className="flex gap-2">
              <button type="button" onClick={() => setStep(0)} className="btn btn-secondary">
                Back
              </button>
              <button type="button" disabled={!backgroundReady} onClick={() => setStep(2)} className="btn btn-primary">
                Continue
              </button>
            </div>
          </div>
          <WorldMap
            selectedIso2={iso2}
            selectedCity={focus}
            onSelectCountry={(next) => void chooseCountry(next)}
            onSelectCity={(selection) =>
              void chooseCountry(selection.iso2, {
                id: selection.id,
                latitude: selection.latitude,
                longitude: selection.longitude,
              })
            }
          />
        </div>
      ) : null}

      {step === 2 ? (
        <div className="max-w-3xl space-y-4">
          <p className="text-sm text-muted">A specialization sets starting skills and introductory missions. It does not permanently lock a career.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {SPECIALIZATIONS.map((key) => (
              <label key={key} className={`rounded border p-3 ${specialization === key ? "border-gold" : "border-line"}`}>
                <input className="sr-only" type="radio" name="specialization-choice" value={key} checked={specialization === key} onChange={() => setSpecialization(key)} />
                <span className="block font-serif text-xl">{SPECIALIZATION_DETAILS[key].title}</span>
                <span className="mt-1 block text-sm text-muted">{SPECIALIZATION_DETAILS[key].summary}</span>
              </label>
            ))}
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => setStep(1)} className="btn btn-secondary">
              Back
            </button>
            <button type="button" onClick={() => setStep(3)} className="btn btn-primary">
              Review
            </button>
          </div>
        </div>
      ) : null}

      {step === 3 ? (
        <form action={action} className="max-w-xl space-y-4">
          <div className="flex items-center gap-3">
            <Portrait portraitKey={portraitKey} />
            <div>
              <h2 className="font-serif text-2xl">{displayName || username}</h2>
              <p className="text-muted">@{username}</p>
            </div>
          </div>
          <p>{biography || "No biography."}</p>
          <p>
            {country?.name ?? "No country"} — {selected?.name ?? "No city"}
          </p>
          <p>{SPECIALIZATION_DETAILS[specialization].title}</p>
          <p className="text-sm text-muted">Starting currency, a field notebook, and the specialization's first skills are assigned by the server.</p>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="confirmed" value="yes" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
            Create this character
          </label>
          <input type="hidden" name="username" value={username} />
          <input type="hidden" name="displayName" value={displayName} />
          <input type="hidden" name="biography" value={biography} />
          <input type="hidden" name="portraitKey" value={portraitKey} />
          <input type="hidden" name="countryIso2" value={iso2 ?? ""} />
          <input type="hidden" name="placeId" value={selected?.startingStatus === "open" ? selected.id : ""} />
          <input type="hidden" name="specialization" value={specialization} />
          {state && !state.ok ? (
            <p className="text-sm text-danger" role="alert">
              {state.error}
            </p>
          ) : null}
          <div className="flex gap-2">
            <button type="button" onClick={() => setStep(2)} className="btn btn-secondary">
              Back
            </button>
            <button disabled={pending || !confirmed || !identityReady || !backgroundReady} className="btn btn-primary">
              {pending ? "Saving character…" : "Create character"}
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}

function CityFacts({ city }: { city: CityRecord }) {
  return (
    <aside className="panel text-sm">
      <h2 className="font-serif text-lg">{city.name}</h2>
      <p>{city.countryName}</p>
      <p>
        {city.latitude.toFixed(5)}, {city.longitude.toFixed(5)}
      </p>
      <p>Population: {city.populationLabel}</p>
      <p>{city.featureLabel}</p>
      {city.admin1Code ? <p>Admin code: {city.admin1Code}</p> : null}
      {city.designNote ? <p className="mt-2 text-muted">{city.designNote}</p> : <p className="mt-2 text-muted">No game-design profile has been assigned.</p>}
      <p className="mt-2 text-muted">Source population status: {populationLabel(city.population, city.populationQuality, null)}</p>
    </aside>
  );
}
