import { describe, expect, it } from "vitest";
import { diplomacyEffect, diplomacyLabel, groupRelations, treatiesForCountry } from "@/lib/politics/diplomacy-view";

describe("diplomacy view", () => {
  it("uses the stored status labels and the sanction rule", () => {
    expect(diplomacyLabel("sanctioned")).toBe("Sanctioned");
    expect(diplomacyLabel("custom")).toBe("custom");
    expect(diplomacyEffect("sanctioned")).toMatch(/travel/);
    expect(diplomacyEffect("friendly")).toMatch(/does not change trade/);
  });

  it("groups recorded relations without treating a missing row as neutral", () => {
    const groups = groupRelations([
      { status: "friendly", name: "France" },
      { status: "sanctioned", name: "Nigeria" },
      { status: "friendly", name: "Germany" },
    ]);
    expect(groups.map((group) => group.status)).toEqual(["sanctioned", "friendly"]);
    expect(groups[1]?.rows.map((row) => row.name)).toEqual(["France", "Germany"]);
  });

  it("attaches treaties only to the stored counterpart", () => {
    const treaties = [
      { iso2: "FR", title: "Trade note" },
      { iso2: "NG", title: "Border note" },
    ];
    expect(treatiesForCountry(treaties, "FR").map((treaty) => treaty.title)).toEqual(["Trade note"]);
  });
});
