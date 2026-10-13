"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { TravelPanel } from "@/components/map/TravelPanel";
import { WorldMap, type MapFocus, type MapPlaceSelection } from "@/components/map/WorldMap";
import { formatCoordinate } from "@/lib/geo/format";
import { formatUtc } from "@/lib/world/clock";
import type { CityRecord, CountrySummary } from "@/lib/geo/queries";
import type { TravelState } from "@/lib/travel/service";
import type { CountryWorldState } from "@/lib/world/events";

export function MapExplorer({
  countries,
  initialCities,
  initialIso2,
  initialCityId,
  travel,
}: {
  countries: CountrySummary[];
  initialCities: CityRecord[];
  initialIso2: string | null;
  initialCityId: string | null;
  travel: TravelState | null;
}) {
  const initialCity = initialCities.find((item) => item.id === initialCityId) ?? null;
  const [iso2, setIso2] = useState(initialIso2);
  const [cities, setCities] = useState(initialCities);
  const [city, setCity] = useState<CityRecord | null>(initialCity);
  const [focus, setFocus] = useState<MapFocus | null>(
    initialCity ? { id: initialCity.id, latitude: initialCity.latitude, longitude: initialCity.longitude } : null,
  );
  const [query, setQuery] = useState("");
  const [countryHits, setCountryHits] = useState<CountrySummary[]>([]);
  const [cityHits, setCityHits] = useState<CityRecord[]>([]);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [status, setStatus] = useState("");
  const [inspectorOpen, setInspectorOpen] = useState(Boolean(initialIso2));
  const [resourceRows, setResourceRows] = useState<{ resourceName: string; metric: string; amount: string | null; unit: string; period: string; quality: string; source: string }[]>([]);
  const [politics, setPolitics] = useState<{ templateName: string | null; leader: string | null } | null>(null);
  const [politicsStatus, setPoliticsStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [resourceStatus, setResourceStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [contest, setContest] = useState<{ status: string; outcome: string; challenger: string; defender: string; resolvesAt: string | null } | null>(null);
  const [world, setWorld] = useState<CountryWorldState | null>(null);
  const [worldStatus, setWorldStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const searchRequest = useRef(0);
  const searchTimer = useRef<number | null>(null);
  const cityRef = useRef(city);
  cityRef.current = city;
  const isoRef = useRef(iso2);
  isoRef.current = iso2;

  async function loadResources(nextIso: string) {
    const response = await fetch(`/api/geo/resources?iso2=${nextIso}`);
    if (isoRef.current !== nextIso) return;
    if (!response.ok) {
      setResourceRows([]);
      setResourceStatus("error");
      return;
    }
    const body = (await response.json()) as { records: { resourceName: string; metric: string; amount: string | null; unit: string; period: string; quality: string; source: string }[] };
    if (isoRef.current !== nextIso) return;
    setResourceRows(body.records);
    setResourceStatus("ready");
  }

  async function loadPolitics(nextIso: string) {
    const response = await fetch(`/api/geo/politics?iso2=${nextIso}`);
    if (isoRef.current !== nextIso) return;
    if (!response.ok) {
      setPolitics(null);
      setPoliticsStatus("error");
      return;
    }
    const body = (await response.json()) as { countries: { templateName: string | null; leader: string | null }[] };
    if (isoRef.current !== nextIso) return;
    setPolitics(body.countries[0] ?? null);
    setPoliticsStatus("ready");
  }

  useEffect(() => {
    if (!city) {
      setContest(null);
      return;
    }
    const placeId = city.id;
    void fetch(`/api/geo/contests?place=${placeId}`)
      .then(async (response) => {
        if (!response.ok) {
          setContest(null);
          return;
        }
        const body = (await response.json()) as { contest: { status: string; outcome: string; challenger: string; defender: string; resolvesAt: string | null } | null };
        if (cityRef.current?.id === placeId) setContest(body.contest);
      })
      .catch(() => {
        if (cityRef.current?.id === placeId) setContest(null);
      });
  }, [city]);

  useEffect(() => {
    if (!iso2) {
      setResourceRows([]);
      setPolitics(null);
      setWorld(null);
      setWorldStatus("idle");
      setPoliticsStatus("idle");
      setResourceStatus("idle");
      return;
    }
    const nextIso = iso2;
    setWorldStatus("loading");
    setPoliticsStatus("loading");
    setResourceStatus("loading");
    void loadResources(nextIso);
    void loadPolitics(nextIso);
    void fetch(`/api/geo/world?iso2=${nextIso}`)
      .then(async (response) => {
        if (!response.ok) throw new Error("unavailable");
        const body = (await response.json()) as { state: CountryWorldState };
        if (isoRef.current === nextIso) {
          setWorld(body.state);
          setWorldStatus("ready");
        }
      })
      .catch(() => {
        if (isoRef.current === nextIso) {
          setWorld(null);
          setWorldStatus("error");
        }
      });
  }, [iso2]);

  async function loadCountry(nextIso: string) {
    setStatus("Loading starting cities…");
    const response = await fetch(`/api/geo/starting-cities?iso2=${nextIso}`);
    if (!response.ok) {
      setCities([]);
      setStatus("Those starting cities could not be loaded.");
      return;
    }
    const body = (await response.json()) as CityRecord[];
    setCities(body);
    setStatus(body.length === 0 ? "No starting cities are configured for this country." : "");
  }

  async function chooseCountry(nextIso: string) {
    setInspectorOpen(true);
    setIso2(nextIso);
    if (cityRef.current?.countryIso2 !== nextIso) {
      setCity(null);
      setFocus(null);
    }
    await loadCountry(nextIso);
  }

  async function showPlace(place: CityRecord) {
    setInspectorOpen(true);
    setIso2(place.countryIso2);
    setCity(place);
    setFocus({ id: place.id, latitude: place.latitude, longitude: place.longitude });
    await loadCountry(place.countryIso2);
  }

  async function chooseMappedCity(selection: MapPlaceSelection) {
    setInspectorOpen(true);
    setIso2(selection.iso2);
    setFocus(selection);
    setStatus("Loading the selected place…");
    const response = await fetch(`/api/geo/places?id=${encodeURIComponent(selection.id)}`);
    if (!response.ok) {
      setStatus("That place could not be loaded.");
      return;
    }
    const place = (await response.json()) as CityRecord;
    setCity(place);
    await loadCountry(place.countryIso2);
  }

  async function inspectPlace(selection: MapFocus) {
    setInspectorOpen(true);
    setFocus(selection);
    setStatus("Loading the selected place…");
    const response = await fetch(`/api/geo/places?id=${encodeURIComponent(selection.id)}`);
    if (!response.ok) {
      setStatus("That place could not be loaded.");
      return;
    }
    const place = (await response.json()) as CityRecord;
    setIso2(place.countryIso2);
    setCity(place);
    await loadCountry(place.countryIso2);
  }

  function queueSearch(value: string) {
    setQuery(value);
    if (searchTimer.current) window.clearTimeout(searchTimer.current);
    searchTimer.current = window.setTimeout(() => {
      void search(value);
    }, 250);
  }

  async function search(value: string, offset = 0) {
    const requestId = ++searchRequest.current;
    if (value.trim().length < 2) {
      setCountryHits([]);
      setCityHits([]);
      setNextOffset(null);
      setStatus("");
      return;
    }
    setStatus(offset === 0 ? "Searching…" : "Loading more cities…");
    const response = await fetch(`/api/search?q=${encodeURIComponent(value)}&offset=${offset}`);
    if (requestId !== searchRequest.current) return;
    if (!response.ok) {
      setStatus("Search could not be completed.");
      return;
    }
    const body = (await response.json()) as { countries: CountrySummary[]; cities: CityRecord[]; nextOffset: number | null };
    if (offset === 0) {
      setCountryHits(body.countries);
      setCityHits(body.cities);
      setStatus(body.countries.length + body.cities.length === 0 ? "No countries or starting cities match." : "");
    } else {
      setCityHits((current) => [...current, ...body.cities]);
      setStatus("");
    }
    setNextOffset(body.nextOffset);
  }

  const selectedCountry = countries.find((country) => country.iso2 === iso2) ?? null;

  function dismissSelection() {
    setIso2(null);
    setCity(null);
    setFocus(null);
    setCities([]);
    setInspectorOpen(false);
  }

  return (
    <div className="relative h-full min-h-0">
      <WorldMap
        fill
        selectedIso2={iso2}
        selectedCity={focus}
        onSelectCountry={(next) => void chooseCountry(next)}
        onSelectCity={(next) => void chooseMappedCity(next)}
        onInspectPlace={(next) => void inspectPlace(next)}
        playerLatitude={travel?.latitude ?? null}
        playerLongitude={travel?.longitude ?? null}
        destinationLatitude={travel?.active?.destinationLatitude ?? null}
        destinationLongitude={travel?.active?.destinationLongitude ?? null}
      />
      <div className="pointer-events-none absolute inset-0 z-20">
        <div className="pointer-events-auto absolute top-3 left-3 w-72 max-w-[calc(100%-1.5rem)]">
          <label className="block border border-line bg-panel/95 p-3 text-sm">
            <span className="kicker">Find</span>
            <input
              value={query}
              onChange={(event) => queueSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && countryHits[0] && cityHits.length === 0) {
                  event.preventDefault();
                  void chooseCountry(countryHits[0].iso2);
                }
              }}
              className="field"
              placeholder="Country or starting city"
              aria-label="Search countries and starting cities"
            />
          </label>
          {countryHits.length > 0 || cityHits.length > 0 ? (
            <div className="mt-1 max-h-48 space-y-1 overflow-auto border border-line bg-panel p-2 text-sm" role="listbox" aria-label="Search results">
              {countryHits.map((country) => (
                <button
                  key={country.iso2}
                  type="button"
                  role="option"
                  className="block w-full px-2 py-1 text-left hover:text-gold"
                  onClick={() => void chooseCountry(country.iso2)}
                >
                  {country.name}
                  <span className="text-muted"> · country</span>
                </button>
              ))}
              {cityHits.map((result) => (
                <button
                  key={result.id}
                  type="button"
                  role="option"
                  className="block w-full px-2 py-1 text-left hover:text-gold"
                  onClick={() => void showPlace(result)}
                >
                  {result.name}, {result.countryName}
                </button>
              ))}
              {nextOffset != null ? (
                <button type="button" className="px-2 py-1 text-gold" onClick={() => void search(query, nextOffset)}>
                  More cities
                </button>
              ) : null}
            </div>
          ) : null}
          {status ? <p className="mt-1 bg-panel/95 px-3 py-2 text-xs text-muted" role="status">{status}</p> : null}
          {travel?.active ? (
            <p className="mt-1 bg-panel/95 px-3 py-2 text-xs text-ink" role="status">
              In transit to {travel.active.destinationName}. Recorded city remains {travel.cityName} until {formatUtc(travel.active.arrivesAt)}.
            </p>
          ) : null}
        </div>
        {iso2 && !inspectorOpen ? (
          <button type="button" className="btn btn-secondary pointer-events-auto absolute top-3 right-14" onClick={() => setInspectorOpen(true)}>
            {selectedCountry?.name ?? iso2}
          </button>
        ) : null}
        {iso2 && inspectorOpen ? (
          <aside className="map-inspector pointer-events-auto absolute inset-x-3 bottom-16 max-h-[42vh] overflow-auto border border-line bg-panel/95 p-4 text-sm md:top-28 md:right-3 md:bottom-10 md:left-auto md:max-h-none md:w-80" aria-label="Country inspector">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="kicker">Selected</p>
                <h2 className="section-title">{selectedCountry?.name ?? city?.countryName ?? iso2}</h2>
              </div>
              <div className="flex gap-2">
                <button type="button" className="btn btn-secondary" onClick={() => setInspectorOpen(false)}>Hide</button>
                <button type="button" className="btn btn-secondary" onClick={dismissSelection}>Clear</button>
              </div>
            </div>
            {selectedCountry?.capitalName ? <p className="mt-3">Capital recorded as {selectedCountry.capitalName}.</p> : null}
            {selectedCountry?.population != null ? <p className="num">Population {selectedCountry.population.toLocaleString("en-US")}</p> : <p className="text-muted">Population is unreported.</p>}
            {city ? (
              <div className="mt-3 border-t border-line pt-3">
                <h3 className="font-serif text-lg">{city.name}</h3>
                <p className="num">{formatCoordinate(city.latitude, "lat")}, {formatCoordinate(city.longitude, "lon")}</p>
                <p>Population: {city.populationLabel}</p>
                <p>{city.featureLabel}</p>
                {city.admin1Code ? <p>Admin code: {city.admin1Code}</p> : null}
                {city.startingStatus ? <p>Starting status: {city.startingStatus}</p> : <p>Not a starting city.</p>}
                {city.designNote ? <p className="mt-2 text-muted">{city.designNote}</p> : null}
                {contest ? (
                  <p className="mt-2">
                    Presence contest: {contest.challenger} and {contest.defender} · {contest.status}
                    {contest.status === "resolved" ? ` · ${contest.outcome}` : ""}
                    {contest.resolvesAt ? ` · resolves ${formatUtc(contest.resolvesAt)}` : ""}. This does not change the country.
                  </p>
                ) : (
                  <p className="mt-2 text-muted">No city contest is recorded here.</p>
                )}
                {travel ? <TravelPanel city={city} travel={travel} /> : null}
              </div>
            ) : null}
            <div className="mt-3 border-t border-line pt-3">
              <h3 className="kicker">Starting cities</h3>
              {cities.length === 0 ? <p className="mt-2 text-muted">No starting cities are configured for this country.</p> : null}
              <ul className="mt-2 max-h-36 space-y-1 overflow-auto">
                {cities.map((item) => (
                  <li key={item.id}>
                    <button type="button" className={`w-full px-1 py-1 text-left ${city?.id === item.id ? "text-gold" : ""}`} onClick={() => void showPlace(item)}>
                      {item.name}
                      {item.startingStatus && item.startingStatus !== "open" ? <span className="text-muted"> · {item.startingStatus}</span> : null}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
            <div className="mt-3 border-t border-line pt-3">
              <h3 className="kicker">World state</h3>
              {worldStatus === "loading" ? <p className="mt-2 text-muted" role="status">Loading the stored country state…</p> : null}
              {worldStatus === "error" ? <p className="mt-2 text-danger" role="status">The stored country state could not be loaded.</p> : null}
              {worldStatus === "ready" && world ? (
                <div className="mt-2 space-y-2">
                  {world.bulletin ? (
                    <p>
                      {world.bulletin.title}. Progress <span className="num">{world.bulletin.progress} / {world.bulletin.goal}</span>. Pays <span className="num">{world.bulletin.reward}</span>. {world.bulletin.status === "scheduled" ? "Opens" : "Ends"} {formatUtc(world.bulletin.status === "scheduled" ? world.bulletin.startsAt : world.bulletin.endsAt)}. A resident whose political home is this country records one company shift.
                    </p>
                  ) : (
                    <p className="text-muted">No work bulletin is open for this country.</p>
                  )}
                  {world.policies.length === 0 ? <p className="text-muted">No enacted game law is stored.</p> : null}
                  <ul className="space-y-2">
                    {world.policies.map((policy) => (
                      <li key={policy.effectKey}>
                        <p>{policy.label} <span className="num">{policy.effectValue}</span></p>
                        <p className="text-xs text-muted">{policy.effect}</p>
                      </li>
                    ))}
                  </ul>
                  <p className="text-xs text-muted">These records do not change the border.</p>
                  <Link href="/events" className="inline-block text-gold">Open events</Link>
                </div>
              ) : null}
            </div>
            <div className="mt-3 border-t border-line pt-3">
              <h3 className="kicker">Game politics</h3>
              {politicsStatus === "loading" ? <p className="mt-2 text-muted" role="status">Loading the stored game politics…</p> : null}
              {politicsStatus === "error" ? <p className="mt-2 text-danger" role="status">The stored game politics could not be loaded.</p> : null}
              {politicsStatus === "ready" ? (
                <>
                  <p className="mt-2">{politics?.templateName ? `Game constitution: ${politics.templateName}` : "No game constitution has been adopted."}</p>
                  <p>{politics?.leader ? `Current game executive: ${politics.leader}` : "No game executive."}</p>
                </>
              ) : null}
              <p className="mt-2 text-xs text-muted">Fictional game state. Not the real-world government.</p>
              <Link href={`/politics/${iso2}`} className="mt-2 inline-block text-gold">Open game politics</Link>
            </div>
            <div className="mt-3 border-t border-line pt-3">
              <h3 className="kicker">Reference statistics</h3>
              {resourceStatus === "loading" ? <p className="mt-2 text-muted" role="status">Loading imported statistics…</p> : null}
              {resourceStatus === "error" ? <p className="mt-2 text-danger" role="status">Imported statistics could not be loaded.</p> : null}
              {resourceStatus === "ready" && resourceRows.length === 0 ? <p className="mt-2 text-muted">No imported resource statistic is stored for this country.</p> : null}
              <ul className="mt-2 space-y-2">
                {resourceRows.map((row) => (
                  <li key={`${row.resourceName}-${row.metric}-${row.period}`}>
                    <p>{row.resourceName} · {row.metric.replaceAll("_", " ")}</p>
                    <p className="num">
                      {row.quality === "reported_zero"
                        ? `0 ${row.unit} (source reports zero)`
                        : row.amount == null
                          ? "Unreported"
                          : `${Number(row.amount).toLocaleString("en-US")} ${row.unit}`}
                      {" · "}
                      {row.period}
                    </p>
                    <p className="text-xs text-muted">{row.source}. Country total, not a game stockpile.</p>
                  </li>
                ))}
              </ul>
              <Link href="/resources" className="mt-2 inline-block text-gold">Open resource statistics</Link>
            </div>
          </aside>
        ) : null}
      </div>
    </div>
  );
}
