import { describe, expect, it } from "vitest";
import { LAUNCH_COUNTRIES, startingCityTargetTotal } from "@/data/launch-countries";

const REQUIRED = [
  "BE", "NL", "DE", "FR", "GB", "ES", "IT", "PL", "SE", "NO",
  "NG", "ZA", "EG", "KE", "CD", "US", "CA", "MX", "BR", "AR",
  "VE", "CL", "CN", "IN", "JP", "ID", "SA", "AE", "AU", "NZ",
];

describe("launch country configuration", () => {
  it("lists the 30 launch countries inside the starting-city budget", () => {
    expect(LAUNCH_COUNTRIES.map((country) => country.iso2).sort()).toEqual([...REQUIRED].sort());
    const total = startingCityTargetTotal();
    expect(total).toBeGreaterThanOrEqual(300);
    expect(total).toBeLessThanOrEqual(500);
    for (const country of LAUNCH_COUNTRIES) {
      expect(country.target).toBeGreaterThanOrEqual(country.min);
      expect(country.target).toBeLessThanOrEqual(country.max);
    }
  });
});
