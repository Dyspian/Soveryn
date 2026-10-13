export type VoteTally = { id: string; votes: number };

/** D'Hondt seat allocation. A zero-vote list receives no seats. Ties keep the earlier list. */
export function dhondt(lists: VoteTally[], seats: number): Map<string, number> {
  const allocated = new Map(lists.map((list) => [list.id, 0]));
  for (let seat = 0; seat < seats; seat += 1) {
    let bestId = "";
    let bestScore = 0;
    for (const list of lists) {
      const score = list.votes / ((allocated.get(list.id) ?? 0) + 1);
      if (score > bestScore) {
        bestScore = score;
        bestId = list.id;
      }
    }
    if (!bestId || bestScore <= 0) break;
    allocated.set(bestId, (allocated.get(bestId) ?? 0) + 1);
  }
  return allocated;
}
