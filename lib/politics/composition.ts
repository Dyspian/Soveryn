import { toneFor, type MarkTone } from "@/components/game/marks";

export type SeatRecord = {
  id: string;
  username: string | null;
  partyId: string | null;
  party: string | null;
  abbreviation: string | null;
};

export type PartyGroup = {
  key: string;
  partyId: string | null;
  name: string;
  abbreviation: string;
  seats: number;
  tone: MarkTone | "independent";
};

export function orderedSeats(seats: SeatRecord[]): SeatRecord[] {
  return [...seats].sort((left, right) => {
    const party = (left.party ?? "\uffff").localeCompare(right.party ?? "\uffff");
    if (party !== 0) return party;
    const name = (left.username ?? "").localeCompare(right.username ?? "");
    if (name !== 0) return name;
    return left.id.localeCompare(right.id);
  });
}

export function groupSeats(seats: SeatRecord[]): PartyGroup[] {
  const groups = new Map<string, PartyGroup>();
  for (const seat of orderedSeats(seats)) {
    const key = seat.partyId ?? "independent";
    const current = groups.get(key) ?? {
      key,
      partyId: seat.partyId,
      name: seat.party ?? "Independent",
      abbreviation: seat.partyId ? (seat.abbreviation ?? "") : "IND",
      seats: 0,
      tone: seat.partyId ? toneFor(seat.partyId) : "independent",
    };
    current.seats += 1;
    groups.set(key, current);
  }
  return [...groups.values()];
}

export function largestParty(groups: PartyGroup[]): PartyGroup | null {
  const parties = groups.filter((group) => group.partyId);
  if (parties.length === 0) return null;
  const top = Math.max(...parties.map((group) => group.seats));
  const leaders = parties.filter((group) => group.seats === top);
  return leaders.length === 1 ? leaders[0] : null;
}

export function chamberDenominator(capacity: number, occupied: number): number {
  return Math.max(capacity, occupied, 0);
}

export function unfilledSeats(capacity: number, occupied: number): number {
  return Math.max(0, capacity - occupied);
}

export function hemicycle(count: number): { x: number; y: number }[] {
  if (count <= 0) return [];
  return Array.from({ length: count }, (_, index) => {
    const t = count === 1 ? 0.5 : index / (count - 1);
    const angle = Math.PI * (1 - t);
    return {
      x: 50 + 40 * Math.cos(angle),
      y: 78 - 46 * Math.sin(angle),
    };
  });
}
