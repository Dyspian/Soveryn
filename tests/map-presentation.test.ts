import { describe, expect, it } from "vitest";
import { territoryFrame } from "@/lib/geo/bounds";
import { constitutionColor, constitutionLegend, countryTintChange } from "@/lib/map/presentation";

describe("territory framing", () => {
  it("frames a compact polygon", () => {
    expect(
      territoryFrame({
        type: "Polygon",
        coordinates: [
          [
            [2, 50],
            [6, 51],
            [4, 49],
            [2, 50],
          ],
        ],
      }),
    ).toEqual({ mode: "bounds", west: 2, south: 49, east: 6, north: 51 });
  });

  it("uses the short arc when a polygon crosses the antimeridian", () => {
    const frame = territoryFrame({
      type: "MultiPolygon",
      coordinates: [
        [
          [
            [179, -10],
            [179.5, -9],
          ],
        ],
        [
          [
            [-179, -10],
            [-178, -8],
          ],
        ],
      ],
    });
    expect(frame?.mode).toBe("center");
    if (frame?.mode === "center") {
      expect(Math.abs(frame.longitude)).toBeGreaterThan(170);
      expect(frame.latitude).toBeCloseTo(-9);
      expect(frame.zoom).toBeGreaterThan(3);
    }
  });

  it("returns nothing for empty or unusable geometry", () => {
    expect(territoryFrame(null)).toBeNull();
    expect(territoryFrame({ type: "Polygon", coordinates: [] })).toBeNull();
    expect(territoryFrame({ type: "Point", coordinates: [400, 10] })).toBeNull();
  });
});

describe("map presentation", () => {
  it("keeps a constitution color stable and distinct from a neighboring template", () => {
    expect(constitutionColor("dictatorship")).toBe(constitutionColor("dictatorship"));
    expect(constitutionColor("dictatorship")).not.toBe(constitutionColor("presidential_republic"));
    expect(constitutionColor("unlisted_template")).toBe(constitutionColor("unlisted_template"));
  });

  it("builds a legend only from adopted templates", () => {
    expect(
      constitutionLegend([
        { iso2: "BE", templateId: "dictatorship", templateName: "Dictatorship" },
        { iso2: "NG", templateId: "presidential_republic", templateName: "Presidential republic" },
        { iso2: "FR", templateId: null, templateName: null },
        { iso2: "NL", templateId: "dictatorship", templateName: "Dictatorship" },
      ]),
    ).toEqual([
      { templateId: "dictatorship", templateName: "Dictatorship", color: constitutionColor("dictatorship") },
      { templateId: "presidential_republic", templateName: "Presidential republic", color: constitutionColor("presidential_republic") },
    ]);
  });

  it("keeps country tints from meaning two things at once", () => {
    expect(countryTintChange({ resources: false, politics: false }, { key: "politics", enabled: true })).toEqual({
      resources: false,
      politics: true,
    });
    expect(countryTintChange({ resources: false, politics: true }, { key: "resources", enabled: true })).toEqual({
      resources: true,
      politics: false,
    });
    expect(countryTintChange({ resources: true, politics: false }, { key: "resources", enabled: false })).toEqual({
      resources: false,
      politics: false,
    });
  });
});
