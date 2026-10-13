"use client";

import { WorldMap } from "@/components/map/WorldMap";
import type { CityRecord } from "@/lib/geo/queries";

export function SavedMap({ city, preview = false }: { city: CityRecord; preview?: boolean }) {
  return (
    <WorldMap
      selectedIso2={city.countryIso2}
      selectedCity={{ id: city.id, latitude: city.latitude, longitude: city.longitude }}
      onSelectCountry={() => undefined}
      onSelectCity={() => undefined}
      preview={preview}
    />
  );
}
