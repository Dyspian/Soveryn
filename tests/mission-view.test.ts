import { describe, expect, it } from "vitest";
import { nextObjective, objectiveCount, objectiveLinks, progressWidth } from "@/lib/progression/mission-view";

describe("mission view", () => {
  it("counts stored objectives and names the first open one", () => {
    const objectives = [
      { id: "a", completed: true },
      { id: "b", completed: false },
    ];
    expect(objectiveCount(objectives)).toEqual({ done: 1, total: 2 });
    expect(nextObjective(objectives)?.id).toBe("b");
    expect(nextObjective([{ id: "a", completed: true }])).toBeNull();
  });

  it("links only the screens that match the stored objective kind", () => {
    expect(objectiveLinks("work_shift").map((link) => link.href)).toEqual(["/businesses", "/jobs"]);
    expect(objectiveLinks("journey_arrived")).toEqual([{ href: "/map", label: "Open the map" }]);
    expect(objectiveLinks("match_population")).toEqual([]);
    expect(objectiveLinks("unknown")).toEqual([]);
  });

  it("sizes a progress bar from the stored goal", () => {
    expect(progressWidth(1, 4)).toBe(25);
    expect(progressWidth(5, 4)).toBe(100);
    expect(progressWidth(1, 0)).toBe(0);
  });
});
