import { describe, expect, it } from "vitest";
import { electionLabel, governmentClaim, selectionLabel } from "@/lib/politics/government-view";

describe("government view", () => {
  it("uses the stored election and office labels", () => {
    expect(electionLabel("pr_parliament")).toBe("Proportional parliament");
    expect(electionLabel("custom")).toBe("custom");
    expect(selectionLabel("claim")).toMatch(/party leader/);
  });

  it("follows the parliamentary bloc rule, including a tie", () => {
    const counts = [
      { partyId: "a", seats: 2 },
      { partyId: "b", seats: 2 },
      { partyId: "c", seats: 1 },
    ];
    expect(governmentClaim("a", counts, []).ahead).toBe(false);
    expect(governmentClaim("a", counts, [{ partyA: "a", partyB: "c" }])).toEqual({ bloc: 3, rival: 2, ahead: true });
    expect(governmentClaim("b", counts, [{ partyA: "a", partyB: "c" }])).toEqual({ bloc: 2, rival: 3, ahead: false });
  });
});
