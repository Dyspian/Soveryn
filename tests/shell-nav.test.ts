import { describe, expect, it } from "vitest";
import { gameNav, groupSelected, mobileDock, navSelected } from "@/lib/game/nav";
import { shellProgress } from "@/lib/game/shell";

describe("game navigation", () => {
  it("matches a section without treating a longer path as the same page", () => {
    expect(navSelected("/businesses/abc", "/businesses")).toBe(true);
    expect(navSelected("/politics/be", "/politics")).toBe(true);
    expect(navSelected("/characters/ronald", "/character")).toBe(false);
    expect(navSelected("/dashboard/extra", "/dashboard")).toBe(false);
    expect(navSelected("/dashboard", "/dashboard")).toBe(true);
  });

  it("points every nav item at an existing route", () => {
    const hrefs = [...gameNav.flatMap((group) => group.items.map((item) => item.href)), ...mobileDock.map((item) => item.href)];
    expect(new Set(hrefs)).toEqual(
      new Set(["/map", "/character", "/skills", "/inventory", "/missions", "/events", "/businesses", "/market", "/jobs", "/resources", "/politics", "/organizations", "/dashboard"]),
    );
    expect(groupSelected("/inventory", gameNav.find((group) => group.id === "character")?.items ?? [])).toBe(true);
  });

  it("measures experience inside the stored level band", () => {
    const bands = [
      { level: 1, xpRequired: 0 },
      { level: 2, xpRequired: 100 },
      { level: 4, xpRequired: 300 },
    ];
    expect(shellProgress(1, 40, bands)).toEqual({ into: 40, span: 100 });
    expect(shellProgress(4, 300, bands)).toEqual({ into: 0, span: 0 });
    expect(shellProgress(3, 10, [])).toEqual({ into: 0, span: 0 });
  });
});
