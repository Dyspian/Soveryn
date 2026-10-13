import { describe, expect, it } from "vitest";
import { latestReserveRows } from "@/lib/economy/reserves";

describe("reserve import rows", () => {
  it("keeps the latest year, preserves a source zero, and skips a blank amount", () => {
    const rows = latestReserveRows(
      ["entity,code,year,oil_reserves_m3", "Belgium,BEL,2020,", "Belgium,BEL,2021,0", "Venezuela,VEN,2020,10", "Venezuela,VEN,2021,48", "World,OWID_WRL,2021,99"].join("\n"),
    );
    expect(rows).toEqual([
      { iso3: "BEL", name: "Belgium", year: 2021, amount: 0, quality: "reported_zero" },
      { iso3: "VEN", name: "Venezuela", year: 2021, amount: 48, quality: "reported" },
    ]);
  });
});
