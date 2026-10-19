import { describe, expect, it } from "vitest";
import { chamberDenominator, groupSeats, hemicycle, largestParty, unfilledSeats, type SeatRecord } from "@/lib/politics/composition";

function seat(id: string, partyId: string | null, party: string | null, username: string): SeatRecord {
  return { id, username, partyId, party, abbreviation: party ? party.slice(0, 3) : null };
}

describe("parliament composition", () => {
  it("keeps party totals exact and does not invent a party", () => {
    const groups = groupSeats([
      seat("1", "a", "Alpha", "ada"),
      seat("2", "a", "Alpha", "bea"),
      seat("3", "b", "Beta", "cam"),
    ]);
    expect(groups.map((group) => [group.name, group.seats])).toEqual([
      ["Alpha", 2],
      ["Beta", 1],
    ]);
    expect(groups.reduce((sum, group) => sum + group.seats, 0)).toBe(3);
  });

  it("names a largest party only when one party is strictly ahead", () => {
    expect(largestParty(groupSeats([seat("1", "a", "Alpha", "ada"), seat("2", "a", "Alpha", "bea"), seat("3", "b", "Beta", "cam")]))?.name).toBe("Alpha");
    expect(largestParty(groupSeats([seat("1", "a", "Alpha", "ada"), seat("2", "b", "Beta", "cam")]))).toBeNull();
    expect(largestParty([])).toBeNull();
  });

  it("counts unfilled capacity without dividing by zero", () => {
    expect(unfilledSeats(5, 0)).toBe(5);
    expect(unfilledSeats(5, 5)).toBe(0);
    expect(unfilledSeats(0, 2)).toBe(0);
    expect(chamberDenominator(0, 0)).toBe(0);
    expect(chamberDenominator(5, 2)).toBe(5);
  });

  it("places one point per seat inside the chamber", () => {
    expect(hemicycle(0)).toEqual([]);
    const points = hemicycle(5);
    expect(points).toHaveLength(5);
    expect(points.every((point) => point.x >= 0 && point.x <= 100 && point.y >= 0 && point.y <= 100)).toBe(true);
  });

  it("keeps a party tone stable for the same id", () => {
    const [first] = groupSeats([seat("1", "party-1", "Alpha", "ada")]);
    const [second] = groupSeats([seat("9", "party-1", "Alpha", "bea")]);
    expect(first?.tone).toBe(second?.tone);
  });
});
