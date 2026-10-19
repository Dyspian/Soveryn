export function objectiveCount(objectives: { completed: boolean }[]): { done: number; total: number } {
  return { done: objectives.filter((objective) => objective.completed).length, total: objectives.length };
}

export function nextObjective<T extends { completed: boolean }>(objectives: T[]): T | null {
  return objectives.find((objective) => !objective.completed) ?? null;
}

export function progressWidth(progress: number, goal: number): number {
  if (!Number.isFinite(progress) || !Number.isFinite(goal) || goal <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((progress / goal) * 100)));
}

export function objectiveLinks(kind: string): { href: string; label: string }[] {
  if (kind === "skill_practiced" || kind === "skill_level") return [{ href: "/skills", label: "Open skills" }];
  if (kind === "level_reached") return [{ href: "/character", label: "Open character" }];
  if (kind === "work_shift") return [
    { href: "/businesses", label: "Open businesses" },
    { href: "/jobs", label: "Open jobs" },
  ];
  if (kind === "market_sold") return [{ href: "/market", label: "Open the market" }];
  if (kind === "shipment_delivered" || kind === "production_finished") return [{ href: "/businesses", label: "Open businesses" }];
  if (kind === "journey_arrived") return [{ href: "/map", label: "Open the map" }];
  return [];
}
