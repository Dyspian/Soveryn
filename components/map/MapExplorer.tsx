"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { EntityMark } from "@/components/game/EntityMark";
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
  const [resourceRows, setResourceRows] = useState<{ resourceType: string; resourceName: string; metric: string; amount: string | null; unit: string; period: string; quality: string; source: string }[]>([]);
  const [politics, setPolitics] = useState<{ templateName: string | null; leader: string | null; relations: number; treaties: number } | null>(null);
  const [politicsStatus, setPoliticsStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [resourceStatus, setResourceStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [contest, setContest] = useState<{ status: string; outcome: string; challenger: string; defender: string; resolvesAt: string | null } | null>(null);
  const [world, setWorld] = useState<CountryWorldState | null>(null);
  const [worldStatus, setWorldStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [organizations, setOrganizations] = useState<{ id: string; name: string; tag: string; city: string; orgType: string }[]>([]);
  const [organizationStatus, setOrganizationStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [businessCities, setBusinessCities] = useState<{ id: string; name: string }[]>([]);
  const [businessStatus, setBusinessStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [activeHit, setActiveHit] = useState(-1);
  const searchRequest = useRef(0);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const reopenRef = useRef<HTMLButtonElement | null>(null);
  const inspectorWasOpen = useRef(false);
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
    const body = (await response.json()) as { records: { resourceType: string; resourceName: string; metric: string; amount: string | null; unit: string; period: string; quality: string; source: string }[] };
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
    const body = (await response.json()) as { countries: { templateName: string | null; leader: string | null; relations: number; treaties: number }[] };
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
      setOrganizations([]);
      setBusinessCities([]);
      setWorldStatus("idle");
      setPoliticsStatus("idle");
      setResourceStatus("idle");
      setOrganizationStatus("idle");
      setBusinessStatus("idle");
      return;
    }
    const nextIso = iso2;
    setWorldStatus("loading");
    setPoliticsStatus("loading");
    setResourceStatus("loading");
    setOrganizationStatus("loading");
    setBusinessStatus("loading");
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
    void fetch("/api/geo/organizations")
      .then(async (response) => {
        if (!response.ok) throw new Error("organizations");
        const body = (await response.json()) as { features: { properties: { id: string; name: string; tag: string; city: string; iso2: string; orgType: string } }[] };
        if (isoRef.current !== nextIso) return;
        setOrganizations(body.features.map((feature) => feature.properties).filter((item) => item.iso2 === nextIso));
        setOrganizationStatus("ready");
      })
      .catch(() => {
        if (isoRef.current === nextIso) {
          setOrganizations([]);
          setOrganizationStatus("error");
        }
      });
    void fetch("/api/geo/businesses")
      .then(async (response) => {
        if (!response.ok) throw new Error("businesses");
        const body = (await response.json()) as { features: { properties: { id: string; name: string; iso2: string } }[] };
        if (isoRef.current !== nextIso) return;
        setBusinessCities(body.features.map((feature) => feature.properties).filter((item) => item.iso2 === nextIso));
        setBusinessStatus("ready");
      })
      .catch(() => {
        if (isoRef.current === nextIso) {
          setBusinessCities([]);
          setBusinessStatus("error");
        }
      });
  }, [iso2]);

  useEffect(() => {
    if (inspectorOpen && !inspectorWasOpen.current) headingRef.current?.focus();
    inspectorWasOpen.current = inspectorOpen;
  }, [inspectorOpen]);

  function beginCountry(nextIso: string) {
    if (isoRef.current === nextIso) return;
    setCities([]);
    setWorld(null);
    setPolitics(null);
    setResourceRows([]);
    setOrganizations([]);
    setBusinessCities([]);
    setWorldStatus("loading");
    setPoliticsStatus("loading");
    setResourceStatus("loading");
    setOrganizationStatus("loading");
    setBusinessStatus("loading");
  }

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
    beginCountry(nextIso);
    setInspectorOpen(true);
    setIso2(nextIso);
    if (cityRef.current?.countryIso2 !== nextIso) {
      setCity(null);
      setFocus(null);
    }
    await loadCountry(nextIso);
  }

  async function showPlace(place: CityRecord) {
    beginCountry(place.countryIso2);
    setInspectorOpen(true);
    setIso2(place.countryIso2);
    setCity(place);
    setFocus({ id: place.id, latitude: place.latitude, longitude: place.longitude });
    await loadCountry(place.countryIso2);
  }

  async function chooseMappedCity(selection: MapPlaceSelection) {
    beginCountry(selection.iso2);
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
    beginCountry(place.countryIso2);
    setIso2(place.countryIso2);
    setCity(place);
    await loadCountry(place.countryIso2);
  }

  function queueSearch(value: string) {
    setActiveHit(-1);
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
      setActiveHit(-1);
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
      setActiveHit(-1);
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
    window.setTimeout(() => searchRef.current?.focus(), 0);
  }

  function hideInspector() {
    setInspectorOpen(false);
    window.setTimeout(() => reopenRef.current?.focus(), 0);
  }

  const hits = [
    ...countryHits.map((country) => ({ kind: "country" as const, key: country.iso2, country })),
    ...cityHits.map((result) => ({ kind: "city" as const, key: result.id, city: result })),
  ];

  function chooseHit(index: number) {
    const hit = hits[index];
    if (!hit) return;
    if (hit.kind === "country") void chooseCountry(hit.country.iso2);
    else void showPlace(hit.city);
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
        selectedLabel={selectedCountry?.name ?? city?.countryName ?? null}
      />
      <div className="pointer-events-none absolute inset-0 z-20">
        <div className="pointer-events-auto absolute top-3 left-3 w-72 max-w-[calc(100%-1.5rem)]">
          <div className="map-overlay p-3 text-sm">
            <label className="block">
              <span className="kicker">Find</span>
              <input
                ref={searchRef}
                value={query}
                role="combobox"
                aria-expanded={hits.length > 0}
                aria-controls="map-search-results"
                aria-autocomplete="list"
                aria-activedescendant={activeHit >= 0 ? `map-hit-${hits[activeHit]?.key}` : undefined}
                onChange={(event) => queueSearch(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "ArrowDown" && hits.length > 0) {
                    event.preventDefault();
                    setActiveHit((current) => (current + 1) % hits.length);
                  } else if (event.key === "ArrowUp" && hits.length > 0) {
                    event.preventDefault();
                    setActiveHit((current) => (current <= 0 ? hits.length - 1 : current - 1));
                  } else if (event.key === "Escape") {
                    setCountryHits([]);
                    setCityHits([]);
                    setActiveHit(-1);
                  } else if (event.key === "Enter") {
                    if (activeHit >= 0) {
                      event.preventDefault();
                      chooseHit(activeHit);
                    } else if (hits.length === 1) {
                      event.preventDefault();
                      chooseHit(0);
                    } else if (countryHits[0] && cityHits.length === 0) {
                      event.preventDefault();
                      void chooseCountry(countryHits[0].iso2);
                    }
                  }
                }}
                className="field"
                placeholder="Country or starting city"
                aria-label="Search countries and starting cities"
              />
            </label>
            <label className="mt-2 block">
              <span className="kicker">Country</span>
              <select
                className="field"
                value={iso2 ?? ""}
                aria-label="Choose a country"
                onChange={(event) => {
                  const next = event.target.value;
                  if (next) void chooseCountry(next);
                  else dismissSelection();
                }}
              >
                <option value="">Choose a country</option>
                {countries.map((country) => (
                  <option key={country.iso2} value={country.iso2}>
                    {country.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {hits.length > 0 ? (
            <div id="map-search-results" className="mt-1 max-h-48 space-y-1 overflow-auto border border-line bg-panel p-2 text-sm" role="listbox" aria-label="Search results">
              {hits.map((hit, index) => (
                <button
                  key={hit.key}
                  id={`map-hit-${hit.key}`}
                  type="button"
                  role="option"
                  aria-selected={index === activeHit}
                  className={`block min-h-11 w-full px-2 py-2 text-left ${index === activeHit ? "text-gold" : ""}`}
                  onClick={() => chooseHit(index)}
                >
                  {hit.kind === "country" ? (
                    <>
                      {hit.country.name}
                      <span className="text-muted"> · country</span>
                    </>
                  ) : (
                    <>
                      {hit.city.name}, {hit.city.countryName}
                    </>
                  )}
                </button>
              ))}
              {nextOffset != null ? (
                <button type="button" className="min-h-11 px-2 py-2 text-gold" onClick={() => void search(query, nextOffset)}>
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
          <button ref={reopenRef} type="button" className="btn btn-secondary pointer-events-auto absolute top-3 right-14" onClick={() => setInspectorOpen(true)}>
            {selectedCountry?.name ?? iso2}
          </button>
        ) : null}
        {iso2 && inspectorOpen ? (
          <aside className="map-inspector pointer-events-auto absolute inset-x-3 bottom-16 z-30 max-h-[42vh] overflow-auto border border-line bg-panel p-4 text-sm md:top-28 md:right-3 md:bottom-10 md:left-auto md:max-h-[calc(100%-8.5rem)] md:w-80" aria-label="Country inspector">
            <div className="sticky top-0 z-10 -mx-4 -mt-4 mb-3 flex items-start justify-between gap-3 border-b border-line bg-panel px-4 py-3">
              <div className="flex min-w-0 items-center gap-2">
                <EntityMark kind="country" code={iso2} label={selectedCountry?.name ?? city?.countryName ?? iso2} size="sm" />
                <div className="min-w-0">
                  <p className="kicker">Selected country</p>
                  <h2 ref={headingRef} tabIndex={-1} className="section-title truncate outline-none">{selectedCountry?.name ?? city?.countryName ?? iso2}</h2>
                </div>
              </div>
              <div className="flex gap-2">
                <button type="button" className="btn btn-secondary" onClick={hideInspector}>Hide</button>
                <button type="button" className="btn btn-secondary" onClick={dismissSelection}>Clear</button>
              </div>
            </div>
            <p className="text-xs text-muted">Geographic country. The records below are stored game state, not ownership of the territory.</p>
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
              {cities.length === 0 ? (
                status.startsWith("Loading") ? <p className="mt-2 text-muted" role="status">{status}</p> : <p className="mt-2 text-muted">No starting cities are configured for this country.</p>
              ) : null}
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
                  <p>{politics && Number(politics.relations) > 0 ? `${Number(politics.relations)} recorded diplomatic ${Number(politics.relations) === 1 ? "status" : "statuses"}.` : "No recorded diplomatic status."}</p>
                  <p>{politics && Number(politics.treaties) > 0 ? `${Number(politics.treaties)} signed ${Number(politics.treaties) === 1 ? "treaty" : "treaties"}.` : "No treaty is signed."}</p>
                </>
              ) : null}
              <p className="mt-2 text-xs text-muted">Fictional game state. Not the real-world government.</p>
              <Link href={`/politics/${iso2}`} className="mt-2 inline-block min-h-11 text-gold">Open game politics</Link>
            </div>
            <div className="mt-3 border-t border-line pt-3">
              <h3 className="kicker">Public presence</h3>
              {organizationStatus === "loading" ? <p className="mt-2 text-muted" role="status">Loading public organizations…</p> : null}
              {organizationStatus === "error" ? <p className="mt-2 text-danger" role="status">Public organizations could not be loaded.</p> : null}
              {organizationStatus === "ready" && organizations.length === 0 ? <p className="mt-2 text-muted">No public organization has its headquarters in this country.</p> : null}
              <ul className="mt-2 space-y-1">
                {organizations.map((organization) => (
                  <li key={organization.id}>
                    <Link href={`/organizations/${organization.id}`} className="text-gold">{organization.name}</Link>
                    <span className="text-muted"> [{organization.tag}] · {organization.city} · {organization.orgType}</span>
                  </li>
                ))}
              </ul>
              {businessStatus === "loading" ? <p className="mt-2 text-muted" role="status">Loading business cities…</p> : null}
              {businessStatus === "error" ? <p className="mt-2 text-danger" role="status">Business cities could not be loaded.</p> : null}
              {businessStatus === "ready" && businessCities.length === 0 ? <p className="mt-2 text-muted">No active business is registered in a recorded city here.</p> : null}
              {businessCities.length > 0 ? <p className="mt-2">Recorded cities with an active business: {businessCities.map((item) => item.name).join(", ")}.</p> : null}
              <Link href="/businesses" className="mt-2 inline-block min-h-11 text-gold">Open businesses</Link>
            </div>
            <div className="mt-3 border-t border-line pt-3">
              <h3 className="kicker">Reference statistics</h3>
              {resourceStatus === "loading" ? <p className="mt-2 text-muted" role="status">Loading imported statistics…</p> : null}
              {resourceStatus === "error" ? <p className="mt-2 text-danger" role="status">Imported statistics could not be loaded.</p> : null}
              {resourceStatus === "ready" && resourceRows.length === 0 ? <p className="mt-2 text-muted">No imported resource statistic is stored for this country.</p> : null}
              <ul className="mt-2 space-y-2">
                {resourceRows.map((row) => (
                  <li key={`${row.resourceType}-${row.metric}-${row.period}`}>
                    <p className="flex items-center gap-2">
                      <EntityMark kind="resource" id={row.resourceType} label={row.resourceName} size="sm" />
                      <span>{row.resourceName} · {row.metric.replaceAll("_", " ")}</span>
                    </p>
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
