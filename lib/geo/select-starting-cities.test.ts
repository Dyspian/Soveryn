import { describe, expect, it } from "vitest";
import { selectStartingPlaces, type StartingCandidate } from "@/lib/geo/select-starting-cities";

function place(overrides: Partial<StartingCandidate> & Pick<StartingCandidate, "geonameId" | "asciiName">): StartingCandidate {
  return {
    population: 100_000,
    featureCode: "PPL",
    latitude: 0,
    longitude: 0,
    ...overrides,
  };
}

describe("starting city selection", () => {
  const places = [
    place({ geonameId: 1, asciiName: "Capital", population: 1_000_000, featureCode: "PPLC", latitude: 50, longitude: 4 }),
    place({ geonameId: 2, asciiName: "Suburb", population: 900_000, latitude: 50.08, longitude: 4.05 }),
    place({ geonameId: 3, asciiName: "Port", population: 200_000, featureCode: "PPLA", latitude: 51.3, longitude: 3.2 }),
    place({ geonameId: 4, asciiName: "Inland", population: 180_000, latitude: 49.6, longitude: 5.6 }),
    place({ geonameId: 5, asciiName: "North", population: 150_000, latitude: 51.2, longitude: 4.4 }),
  ];

  it("keeps the capital and skips a nearby suburb", () => {
    const { selected, shortfall } = selectStartingPlaces(places, 3);
    const ids = selected.map((item) => item.geonameId);
    expect(shortfall).toBe(0);
    expect(ids[0]).toBe(1);
    expect(ids).not.toContain(2);
    expect(ids).toHaveLength(3);
  });

  it("spreads across large places instead of an obscure outlier", () => {
    const line = Array.from({ length: 10 }, (_, index) =>
      place({
        geonameId: index + 1,
        asciiName: `City ${index}`,
        population: 500_000 - index * 10_000,
        longitude: index * 5,
      }),
    );
    const { selected } = selectStartingPlaces(line, 2);
    expect(selected.map((item) => item.geonameId)).toEqual([1, 8]);
  });

  it("includes a capital that falls outside the population pool", () => {
    const large = Array.from({ length: 9 }, (_, index) =>
      place({
        geonameId: index + 1,
        asciiName: `City ${index}`,
        population: 500_000 - index * 10_000,
        longitude: index * 2,
      }),
    );
    const capital = place({
      geonameId: 99,
      asciiName: "Capital",
      population: null,
      featureCode: "PPLC",
      longitude: 80,
    });
    const { selected } = selectStartingPlaces([...large, capital], 2);
    expect(selected.map((item) => item.geonameId)).toEqual([99, 1]);
  });

  it("reports a shortfall instead of inventing places", () => {
    const { selected, shortfall } = selectStartingPlaces(places, 10);
    expect(selected).toHaveLength(5);
    expect(shortfall).toBe(5);
  });

  it("keeps major cities that are near each other and drops a suburb", () => {
    const ports = [
      place({ geonameId: 1, asciiName: "Capital", population: 800_000, featureCode: "PPLC", latitude: 52.37, longitude: 4.89 }),
      place({ geonameId: 2, asciiName: "Port", population: 600_000, latitude: 51.92, longitude: 4.48 }),
      place({ geonameId: 3, asciiName: "Court", population: 500_000, latitude: 52.08, longitude: 4.3 }),
      place({ geonameId: 4, asciiName: "Suburb", population: 150_000, latitude: 52.37, longitude: 4.95 }),
    ];
    const ids = selectStartingPlaces(ports, 3).selected.map((item) => item.geonameId);
    expect(ids).toEqual([1, 2, 3]);
  });

  it("returns the same cities for the same records", () => {
    const first = selectStartingPlaces(places, 4).selected.map((item) => item.geonameId);
    const second = selectStartingPlaces([...places].reverse(), 4).selected.map((item) => item.geonameId);
    expect(first).toEqual(second);
  });
});
