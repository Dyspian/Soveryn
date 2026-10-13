import { describe, expect, it } from "vitest";
import { interpretPopulation, parseCountryInfoLine, parseGeonameLine } from "@/lib/geo/geonames";

describe("population tokens", () => {
  it("keeps a positive count", () => {
    expect(interpretPopulation("15000")).toEqual({ population: 15000, quality: "imported" });
  });

  it("treats a blank field as unreported", () => {
    expect(interpretPopulation("")).toEqual({ population: null, quality: "population_absent" });
  });

  it("does not treat a source zero as a verified population", () => {
    expect(interpretPopulation("0")).toEqual({ population: null, quality: "population_source_zero" });
  });
});

describe("geonames parsers", () => {
  it("rejects a row with an impossible latitude", () => {
    const columns = new Array(19).fill("");
    columns[0] = "1";
    columns[1] = "Example";
    columns[2] = "Example";
    columns[4] = "120";
    columns[5] = "4";
    columns[6] = "P";
    columns[7] = "PPL";
    columns[8] = "BE";
    expect(parseGeonameLine(columns.join("\t"))).toBeNull();
  });

  it("parses a country info row and preserves an absent population", () => {
    const columns = new Array(17).fill("");
    columns[0] = "BE";
    columns[1] = "BEL";
    columns[4] = "Belgium";
    columns[5] = "Brussels";
    columns[6] = "30528";
    columns[7] = "";
    columns[8] = "EU";
    columns[16] = "2802361";
    const parsed = parseCountryInfoLine(columns.join("\t"));
    expect(parsed?.name).toBe("Belgium");
    expect(parsed?.population).toBeNull();
    expect(parsed?.populationQuality).toBe("population_absent");
    expect(parsed?.areaSqKm).toBe(30528);
  });

  it("ignores comment lines", () => {
    expect(parseCountryInfoLine("# ISO")).toBeNull();
  });
});
