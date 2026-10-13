"use client";

import { useEffect, useRef, useState } from "react";
import type { ExpressionSpecification } from "maplibre-gl";
import type { BoundaryCollection, MapPointCollection } from "@/lib/geo/queries";

type MapLibreModule = typeof import("maplibre-gl");

export type MapFocus = {
  id: string;
  latitude: number;
  longitude: number;
};

export type MapPlaceSelection = MapFocus & {
  iso2: string;
  status: string;
};

type Marker = {
  id: string;
  iso2: string;
  longitude: number;
  latitude: number;
};

export function WorldMap({
  selectedIso2,
  selectedCity,
  onSelectCountry,
  onSelectCity,
  onInspectPlace,
  fill = false,
  preview = false,
  playerLatitude = null,
  playerLongitude = null,
  destinationLatitude = null,
  destinationLongitude = null,
}: {
  selectedIso2: string | null;
  selectedCity: MapFocus | null;
  onSelectCountry: (iso2: string) => void;
  onSelectCity: (selection: MapPlaceSelection) => void;
  onInspectPlace?: (selection: MapFocus) => void;
  fill?: boolean;
  preview?: boolean;
  playerLatitude?: number | null;
  playerLongitude?: number | null;
  destinationLatitude?: number | null;
  destinationLongitude?: number | null;
}) {
  const container = useRef<HTMLDivElement | null>(null);
  const frame = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<import("maplibre-gl").Map | null>(null);
  const moduleRef = useRef<MapLibreModule | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const playerMarker = useRef<import("maplibre-gl").Marker | null>(null);
  const destinationMarker = useRef<import("maplibre-gl").Marker | null>(null);
  const callbacks = useRef({ onSelectCountry, onSelectCity, onInspectPlace, selectedIso2, selectedCity });
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [message, setMessage] = useState("Loading the map…");
  const [notice, setNotice] = useState("");
  const [showBorders, setShowBorders] = useState(true);
  const [showStarting, setShowStarting] = useState(true);
  const [showOther, setShowOther] = useState(false);
  const [showResources, setShowResources] = useState(false);
  const [resourceType, setResourceType] = useState("crude_oil");
  const [resourceTypes, setResourceTypes] = useState<{ id: string; name: string }[]>([]);
  const [resourceIso2, setResourceIso2] = useState<string[]>([]);
  const [resourceNote, setResourceNote] = useState("");
  const [showPolitics, setShowPolitics] = useState(false);
  const [politicsIso2, setPoliticsIso2] = useState<string[]>([]);
  const [politicsNote, setPoliticsNote] = useState("");
  const [showBusinesses, setShowBusinesses] = useState(false);
  const [businessNote, setBusinessNote] = useState("");
  const [showOrganizations, setShowOrganizations] = useState(false);
  const [organizationNote, setOrganizationNote] = useState("");
  const [layersOpen, setLayersOpen] = useState(fill);

  useEffect(() => {
    if (window.matchMedia("(max-width: 767px)").matches) setLayersOpen(false);
  }, []);

  useEffect(() => {
    callbacks.current = { onSelectCountry, onSelectCity, onInspectPlace, selectedIso2, selectedCity };
  }, [onSelectCountry, onSelectCity, onInspectPlace, selectedIso2, selectedCity]);

  useEffect(() => {
    let cancelled = false;
    const element = container.current;
    if (!element) return;

    void (async () => {
      try {
        const maplibre = await import("maplibre-gl");
        if (cancelled || !container.current) return;
        moduleRef.current = maplibre;
        maplibre.setWorkerUrl("/maplibre-gl-worker.mjs");
        const map = new maplibre.Map({
          container: container.current,
          style: "https://tiles.openfreemap.org/styles/dark",
          center: [10, 20],
          zoom: 1.25,
          attributionControl: {},
        });
        map.addControl(new maplibre.NavigationControl({ visualizePitch: false }), "top-right");
        mapRef.current = map;
        map.on("load", () => {
          if (cancelled) return;
          void (async () => {
            try {
              await loadBoundaries(map);
            } catch {
              if (!cancelled) setNotice("Country borders could not be loaded.");
            }
            if (cancelled) return;
            addCitySource(map);
            try {
              const response = await fetch("/api/geo/starting-cities?view=map");
              if (!response.ok) throw new Error("markers");
              const collection = (await response.json()) as MapPointCollection;
              const source = map.getSource("cities") as import("maplibre-gl").GeoJSONSource | undefined;
              source?.setData(collection as never);
              markersRef.current = collection.features.map((feature) => ({
                id: feature.properties.id,
                iso2: feature.properties.iso2,
                longitude: feature.geometry.coordinates[0],
                latitude: feature.geometry.coordinates[1],
              }));
              if (collection.features.length === 0 && !cancelled) {
                setNotice("No starting cities are in the database yet.");
              }
            } catch {
              if (!cancelled) setNotice("Starting cities could not be loaded on the map.");
            }
            if (cancelled) return;
            map.on("click", (event) => handleMapClick(map, event.point));
            let hoveredIso: string | null = null;
            map.on("mousemove", "countries-fill", (event) => {
              const next = event.features?.[0]?.id;
              const iso = next == null ? null : String(next);
              if (iso === hoveredIso) return;
              if (hoveredIso && hoveredIso !== iso) map.setFeatureState({ source: "countries", id: hoveredIso }, { hover: false });
              if (iso) {
                hoveredIso = iso;
                map.setFeatureState({ source: "countries", id: iso }, { hover: true });
                map.getCanvas().style.cursor = "pointer";
              }
            });
            map.on("mouseleave", "countries-fill", () => {
              if (hoveredIso) map.setFeatureState({ source: "countries", id: hoveredIso }, { hover: false });
              hoveredIso = null;
              if (map.getCanvas()) map.getCanvas().style.cursor = "";
            });
            for (const layer of ["cities-point", "clusters"]) {
              map.on("mouseenter", layer, () => {
                map.getCanvas().style.cursor = "pointer";
              });
              map.on("mouseleave", layer, () => {
                map.getCanvas().style.cursor = "";
              });
            }
            setStatus("ready");
          })();
        });
        map.on("error", (event) => {
          const text = event.error instanceof Error ? event.error.message : "";
          if (/worker/i.test(text)) {
            setStatus("error");
            setMessage("The map worker could not start. Country and city lists still work.");
          }
        });
      } catch {
        if (!cancelled) {
          setStatus("error");
          setMessage("The map could not be started. Country and city lists still work.");
        }
      }
    })();

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (status !== "ready" || !map?.getLayer("cities-point")) return;
    const selectedId = selectedCity?.id ?? "";
    map.setPaintProperty("cities-point", "circle-color", [
      "case",
      ["==", ["get", "id"], selectedId],
      "#e7e2d6",
      ["==", ["get", "status"], "open"],
      "#c4a15a",
      "#8ea0b5",
    ]);
    map.setPaintProperty("cities-point", "circle-radius", ["case", ["==", ["get", "id"], selectedId], 8, 5]);
    const visibility = showStarting ? "visible" : "none";
    map.setLayoutProperty("cities-point", "visibility", visibility);
    map.setLayoutProperty("clusters", "visibility", visibility);
    map.setLayoutProperty("cluster-count", "visibility", visibility);
  }, [selectedCity?.id, showStarting, status]);

  useEffect(() => {
    const map = mapRef.current;
    const maplibre = moduleRef.current;
    if (status !== "ready" || !map || !maplibre) return;
    playerMarker.current?.remove();
    destinationMarker.current?.remove();
    playerMarker.current = null;
    destinationMarker.current = null;
    if (playerLatitude != null && playerLongitude != null) {
      const element = document.createElement("div");
      element.title = "Recorded city";
      element.style.width = "14px";
      element.style.height = "14px";
      element.style.borderRadius = "999px";
      element.style.background = "#c5a45b";
      element.style.border = "2px solid #e7e2d4";
      playerMarker.current = new maplibre.Marker({ element }).setLngLat([playerLongitude, playerLatitude]).addTo(map);
    }
    if (destinationLatitude != null && destinationLongitude != null) {
      const element = document.createElement("div");
      element.title = "Journey destination";
      element.style.width = "12px";
      element.style.height = "12px";
      element.style.borderRadius = "999px";
      element.style.background = "#6e8ca8";
      element.style.border = "2px solid #e7e2d4";
      destinationMarker.current = new maplibre.Marker({ element }).setLngLat([destinationLongitude, destinationLatitude]).addTo(map);
    }
    return () => {
      playerMarker.current?.remove();
      destinationMarker.current?.remove();
      playerMarker.current = null;
      destinationMarker.current = null;
    };
  }, [destinationLatitude, destinationLongitude, playerLatitude, playerLongitude, status]);

  const focusId = selectedCity?.id ?? null;
  const focusLatitude = selectedCity?.latitude;
  const focusLongitude = selectedCity?.longitude;

  useEffect(() => {
    const map = mapRef.current;
    const maplibre = moduleRef.current;
    if (status !== "ready" || !map || !maplibre) return;
    if (focusId != null && focusLatitude != null && focusLongitude != null) {
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      map.flyTo({
        center: [focusLongitude, focusLatitude],
        zoom: Math.max(map.getZoom(), 7),
        duration: reduce ? 0 : 800,
      });
      return;
    }
    if (!selectedIso2) return;
    const points = markersRef.current.filter((marker) => marker.iso2 === selectedIso2);
    if (points.length === 0) return;
    const bounds = new maplibre.LngLatBounds();
    for (const point of points) bounds.extend([point.longitude, point.latitude]);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    map.fitBounds(bounds, { padding: 48, maxZoom: 6, duration: reduce ? 0 : 700 });
  }, [selectedIso2, focusId, focusLatitude, focusLongitude, status]);

  useEffect(() => {
    const map = mapRef.current;
    if (status !== "ready" || !map?.getLayer("countries-fill")) return;
    const selected = selectedIso2 ?? "";
    const resourceMatch = (showResources && resourceIso2.length > 0 ? ["in", ["get", "iso2"], ["literal", resourceIso2]] : ["==", ["get", "iso2"], ""]) as ExpressionSpecification;
    const politicsMatch = (showPolitics && politicsIso2.length > 0 ? ["in", ["get", "iso2"], ["literal", politicsIso2]] : ["==", ["get", "iso2"], ""]) as ExpressionSpecification;
    map.setPaintProperty("countries-fill", "fill-opacity", [
      "case",
      ["==", ["get", "iso2"], selected],
      0.42,
      resourceMatch,
      0.38,
      politicsMatch,
      0.38,
      ["boolean", ["feature-state", "hover"], false],
      0.18,
      0.06,
    ]);
    map.setPaintProperty("countries-line", "line-color", ["case", ["==", ["get", "iso2"], selected], "#d8bb78", "#8e9aab"]);
    map.setPaintProperty("countries-line", "line-width", ["case", ["==", ["get", "iso2"], selected], 2.4, ["boolean", ["feature-state", "hover"], false], 1.6, 1]);
    const visibility = showBorders || showResources || showPolitics ? "visible" : "none";
    map.setLayoutProperty("countries-fill", "visibility", visibility);
    map.setLayoutProperty("countries-line", "visibility", visibility);
    map.setPaintProperty("countries-fill", "fill-color", [
      "case",
      ["==", ["get", "iso2"], selected],
      "#d8bb78",
      resourceMatch,
      "#6f9a78",
      politicsMatch,
      "#6e8ca8",
      "#c5a45b",
    ]);
  }, [selectedIso2, showBorders, showResources, showPolitics, resourceIso2, politicsIso2, status]);

  useEffect(() => {
    if (!showResources) return;
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(`/api/geo/resources?type=${encodeURIComponent(resourceType)}`);
        if (!response.ok) throw new Error("resources");
        const body = (await response.json()) as {
          types: { id: string; name: string }[];
          highlights: string[];
        };
        if (cancelled) return;
        setResourceTypes(body.types);
        setResourceIso2(body.highlights);
        setResourceNote(
          body.highlights.length === 0
            ? "No positive proved-reserve records are loaded for this resource. No deposit pins are drawn."
            : "Highlighted countries have a reported proved reserve above zero. The highlight is a country total, not a deposit location.",
        );
      } catch {
        if (!cancelled) setResourceNote("Resource statistics could not be loaded.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showResources, resourceType]);

  useEffect(() => {
    if (!showPolitics) return;
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/geo/politics");
        if (!response.ok) throw new Error("politics");
        const body = (await response.json()) as { highlights: string[]; note: string };
        if (cancelled) return;
        setPoliticsIso2(body.highlights);
        setPoliticsNote(body.note);
      } catch {
        if (!cancelled) setPoliticsNote("Game political status could not be loaded.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showPolitics]);

  useEffect(() => {
    const map = mapRef.current;
    if (status !== "ready" || !map?.getLayer("business-points")) return;
    map.setLayoutProperty("business-points", "visibility", showBusinesses ? "visible" : "none");
    if (!showBusinesses) return;
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/geo/businesses");
        if (!response.ok) throw new Error("businesses");
        const body = (await response.json()) as { type: "FeatureCollection"; features: unknown[]; note: string };
        if (cancelled) return;
        const source = map.getSource("business-cities") as import("maplibre-gl").GeoJSONSource | undefined;
        source?.setData({ type: "FeatureCollection", features: body.features } as never);
        setBusinessNote(body.note);
      } catch {
        if (!cancelled) setBusinessNote("Business locations could not be loaded.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showBusinesses, status]);

  useEffect(() => {
    const map = mapRef.current;
    if (status !== "ready" || !map?.getLayer("organization-points")) return;
    map.setLayoutProperty("organization-points", "visibility", showOrganizations ? "visible" : "none");
    if (!showOrganizations) return;
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/geo/organizations");
        if (!response.ok) throw new Error("organizations");
        const body = (await response.json()) as { type: "FeatureCollection"; features: unknown[]; note: string };
        if (cancelled) return;
        const source = map.getSource("organization-cities") as import("maplibre-gl").GeoJSONSource | undefined;
        source?.setData({ type: "FeatureCollection", features: body.features } as never);
        setOrganizationNote(body.note);
      } catch {
        if (!cancelled) setOrganizationNote("Organization headquarters could not be loaded.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showOrganizations, status]);

  useEffect(() => {
    const map = mapRef.current;
    if (status !== "ready" || !map) return;
    if (!showOther) {
      const source = map.getSource("other-places") as import("maplibre-gl").GeoJSONSource | undefined;
      source?.setData({ type: "FeatureCollection", features: [] });
      return;
    }
    const load = () => {
      const bounds = map.getBounds();
      const params = new URLSearchParams({
        west: String(bounds.getWest()),
        south: String(bounds.getSouth()),
        east: String(bounds.getEast()),
        north: String(bounds.getNorth()),
      });
      void fetch(`/api/geo/places?${params.toString()}`)
        .then((response) => {
          if (!response.ok) throw new Error("places");
          return response.json();
        })
        .then((collection: BoundaryCollection) => {
          const source = map.getSource("other-places") as import("maplibre-gl").GeoJSONSource | undefined;
          source?.setData(collection as never);
        })
        .catch(() => setNotice("Recorded places in this view could not be loaded."));
    };
    map.on("moveend", load);
    load();
    return () => {
      map.off("moveend", load);
    };
  }, [showOther, status]);

  function handleMapClick(map: import("maplibre-gl").Map, point: import("maplibre-gl").Point) {
    const clusters = map.queryRenderedFeatures(point, { layers: ["clusters"] });
    const cluster = clusters[0];
    if (cluster?.geometry.type === "Point") {
      const source = map.getSource("cities") as import("maplibre-gl").GeoJSONSource;
      const clusterId = Number(cluster.properties?.cluster_id);
      const [longitude, latitude] = cluster.geometry.coordinates;
      void source.getClusterExpansionZoom(clusterId).then((zoom) => {
        map.easeTo({ center: [longitude, latitude], zoom, duration: 500 });
      });
      return;
    }

    const points = map.queryRenderedFeatures(point, { layers: ["cities-point"] });
    const city = points[0];
    if (city?.geometry.type === "Point" && city.properties?.id) {
      const [longitude, latitude] = city.geometry.coordinates;
      callbacks.current.onSelectCity({
        id: String(city.properties.id),
        iso2: String(city.properties.iso2 ?? ""),
        status: String(city.properties.status ?? ""),
        longitude,
        latitude,
      });
      return;
    }

    if (callbacks.current.onInspectPlace) {
      const others = map.queryRenderedFeatures(point, { layers: ["other-places"] });
      const other = others[0];
      if (other?.geometry.type === "Point" && other.properties?.id) {
        const [longitude, latitude] = other.geometry.coordinates;
        callbacks.current.onInspectPlace({ id: String(other.properties.id), longitude, latitude });
        return;
      }
    }

    const countries = map.queryRenderedFeatures(point, { layers: ["countries-fill"] });
    const iso2 = countries[0]?.properties?.iso2;
    if (typeof iso2 === "string") callbacks.current.onSelectCountry(iso2);
  }

  function fitWorld() {
    const map = mapRef.current;
    if (!map) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    map.easeTo({ center: [10, 20], zoom: 1.25, duration: reduce ? 0 : 600 });
  }

  function toggleFullscreen() {
    const node = frame.current;
    if (!node) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void node.requestFullscreen();
  }

  const legendNote = [notice, showResources ? resourceNote : "", showPolitics ? politicsNote : "", showBusinesses ? businessNote : "", showOrganizations ? organizationNote : ""].filter(Boolean).join(" ");

  return (
    <div ref={frame} className={`map-frame relative ${fill ? "h-full" : ""}`}>
      <div className={`relative ${fill ? "h-full" : preview ? "h-56" : "h-[55vh] min-h-80"}`}>
        <div ref={container} className="h-full w-full" />
        {status !== "ready" ? (
          <p className="pointer-events-none absolute inset-x-4 top-4 bg-obsidian/90 px-3 py-2 text-sm" role="status">
            {message}
          </p>
        ) : null}
        {layersOpen ? null : (
          <button type="button" className="btn btn-secondary absolute bottom-16 left-3 z-10 md:bottom-3" onClick={() => setLayersOpen(true)}>
            Layers
          </button>
        )}
        {layersOpen ? (
        <div className="absolute bottom-16 left-3 z-10 max-h-[46%] w-64 max-w-[calc(100%-5rem)] overflow-auto border border-line bg-panel/95 p-3 text-xs md:bottom-10">
          <div className="flex items-center justify-between">
            <p className="kicker">Layers</p>
            <button type="button" className="text-muted hover:text-ink" onClick={() => setLayersOpen(false)}>Hide</button>
          </div>
          <div className="mt-2 space-y-1">
            <LayerToggle checked={showBorders} onChange={setShowBorders} label="Country borders" />
            <LayerToggle checked={showStarting} onChange={setShowStarting} label="Starting cities" />
            <LayerToggle checked={showOther} onChange={setShowOther} label="Other recorded places" />
            <LayerToggle
              checked={showResources}
              onChange={(value) => {
                setShowResources(value);
                if (value) setShowBorders(true);
              }}
              label="Resource statistics"
            />
            {showResources ? (
              <label className="flex items-center gap-2 pl-5">
                <span className="sr-only">Resource</span>
                <select
                  value={resourceType}
                  onChange={(event) => setResourceType(event.target.value)}
                  className="field mt-0 min-h-0 py-1"
                  aria-label="Resource statistic"
                >
                  {(resourceTypes.length > 0 ? resourceTypes : [{ id: "crude_oil", name: "Crude oil" }, { id: "natural_gas", name: "Natural gas" }]).map((type) => (
                    <option key={type.id} value={type.id}>
                      {type.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <LayerToggle
              checked={showPolitics}
              onChange={(value) => {
                setShowPolitics(value);
                if (value) setShowBorders(true);
              }}
              label="Game politics"
            />
            <LayerToggle checked={showBusinesses} onChange={setShowBusinesses} label="Business properties" />
            <LayerToggle checked={showOrganizations} onChange={setShowOrganizations} label="Organizations" />
          </div>
          <ul className="mt-3 space-y-1 text-muted">
            <li className="flex items-center gap-2"><span className="inline-block h-2 w-2 bg-gold-bright" /> Selected country</li>
            {showResources ? <li className="flex items-center gap-2"><span className="inline-block h-2 w-2 bg-success" /> Reported proved reserve</li> : null}
            {showPolitics ? <li className="flex items-center gap-2"><span className="inline-block h-2 w-2 bg-info" /> Game political status</li> : null}
            {showBusinesses ? <li>Business marks are headquarters, not borders.</li> : null}
            {showOrganizations ? <li>Organization marks are headquarters, not borders.</li> : null}
            <li>Country borders are not contest results. A city contest, an open work bulletin, and an enacted game law are described in the inspector.</li>
          </ul>
          {legendNote ? <p className="mt-2 text-muted" role="status">{legendNote}</p> : null}
          <p className="mt-2 text-faint">Borders: Natural Earth. Places: GeoNames. Tiles: OpenFreeMap.</p>
          <div className="mt-2 flex gap-2">
            <button type="button" className="btn btn-secondary" onClick={fitWorld}>Fit world</button>
            <button type="button" className="btn btn-secondary" onClick={toggleFullscreen}>Fullscreen</button>
          </div>
        </div>
        ) : (
          <div className="absolute right-3 bottom-3 z-10 flex gap-2">
            <button type="button" className="btn btn-secondary" onClick={fitWorld}>Fit world</button>
          </div>
        )}
      </div>
    </div>
  );
}

function LayerToggle({
  checked,
  onChange,
  label,
  disabled = false,
}: {
  checked: boolean;
  onChange?: (value: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <label className={`flex items-center gap-2 ${disabled ? "text-muted" : ""}`}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange?.(event.target.checked)} />
      {label}
    </label>
  );
}

async function loadBoundaries(map: import("maplibre-gl").Map) {
  const response = await fetch("/api/geo/countries");
  if (!response.ok) throw new Error("boundaries");
  const data = (await response.json()) as BoundaryCollection;
  map.addSource("countries", { type: "geojson", data: data as never, promoteId: "iso2" });
  map.addLayer({
    id: "countries-fill",
    type: "fill",
    source: "countries",
    paint: { "fill-color": "#c5a45b", "fill-opacity": 0.06 },
  });
  map.addLayer({
    id: "countries-line",
    type: "line",
    source: "countries",
    paint: { "line-color": "#8e9aab", "line-width": 1 },
  });
  map.addSource("other-places", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
  map.addLayer({
    id: "other-places",
    type: "circle",
    source: "other-places",
    paint: { "circle-color": "#8ea0b5", "circle-radius": 3, "circle-opacity": 0.8 },
  });
}

function addCitySource(map: import("maplibre-gl").Map) {
  map.addSource("cities", {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] },
    cluster: true,
    clusterRadius: 48,
    clusterMaxZoom: 5,
  });
  map.addLayer({
    id: "clusters",
    type: "circle",
    source: "cities",
    filter: ["has", "point_count"],
    paint: { "circle-color": "#c4a15a", "circle-radius": 16, "circle-opacity": 0.85 },
  });
  map.addLayer({
    id: "cluster-count",
    type: "symbol",
    source: "cities",
    filter: ["has", "point_count"],
    layout: { "text-field": ["get", "point_count_abbreviated"], "text-size": 12 },
    paint: { "text-color": "#0c0d0f" },
  });
  map.addSource("business-cities", {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] },
  });
  map.addSource("organization-cities", {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] },
  });
  map.addLayer({
    id: "organization-points",
    type: "circle",
    source: "organization-cities",
    layout: { visibility: "none" },
    paint: {
      "circle-color": "#8d6b8d",
      "circle-radius": 8,
      "circle-stroke-width": 2,
      "circle-stroke-color": "#d7c4a3",
    },
  });
  map.addLayer({
    id: "business-points",
    type: "circle",
    source: "business-cities",
    layout: { visibility: "none" },
    paint: {
      "circle-color": "#d7c4a3",
      "circle-radius": 7,
      "circle-stroke-width": 2,
      "circle-stroke-color": "#8d6b3a",
    },
  });
  map.addLayer({
    id: "cities-point",
    type: "circle",
    source: "cities",
    filter: ["!", ["has", "point_count"]],
    paint: {
      "circle-color": "#c4a15a",
      "circle-radius": 5,
      "circle-stroke-width": 1,
      "circle-stroke-color": "#0c0d0f",
    },
  });
}
