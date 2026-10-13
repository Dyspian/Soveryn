import { describe, expect, it } from "vitest";
import { dhondt } from "@/lib/politics/seats";

describe("D'Hondt allocation", () => {
  it("gives more seats to larger lists and none to a list with no votes", () => {
    const seats = dhondt(
      [
        { id: "a", votes: 100 },
        { id: "b", votes: 80 },
        { id: "c", votes: 30 },
        { id: "d", votes: 0 },
      ],
      5,
    );
    expect(seats.get("a")).toBe(3);
    expect(seats.get("b")).toBe(2);
    expect(seats.get("c")).toBe(0);
    expect(seats.get("d")).toBe(0);
    expect([...(seats.values())].reduce((sum, value) => sum + value, 0)).toBe(5);
  });
});
