export const ELECTION_LABELS: Record<string, string> = {
  fptp_office: "First past the post",
  two_round: "Two-round",
  pr_parliament: "Proportional parliament",
  party_leadership: "Party leadership",
  confidence: "Confidence",
};

export const SELECTION_LABELS: Record<string, string> = {
  election_fptp: "Filled by a direct election.",
  election_pr: "Filled by a proportional election.",
  appointment: "Filled by appointment.",
  claim: "Claimed by a party leader.",
  succession: "A resident can claim this office while it is vacant.",
};

export function electionLabel(kind: string): string {
  return ELECTION_LABELS[kind] ?? kind;
}

export function selectionLabel(selection: string): string {
  return SELECTION_LABELS[selection] ?? selection;
}

export function governmentClaim(
  partyId: string,
  counts: { partyId: string; seats: number }[],
  agreements: { partyA: string; partyB: string }[],
): { bloc: number; rival: number; ahead: boolean } {
  const agreement = agreements.find((row) => row.partyA === partyId || row.partyB === partyId);
  const seatOf = (id: string) => Number(counts.find((row) => row.partyId === id)?.seats ?? 0);
  const bloc = agreement ? seatOf(agreement.partyA) + seatOf(agreement.partyB) : seatOf(partyId);
  const members = new Set(agreement ? [agreement.partyA, agreement.partyB] : [partyId]);
  let rival = 0;
  for (const row of agreements) {
    if (members.has(row.partyA)) continue;
    rival = Math.max(rival, seatOf(row.partyA) + seatOf(row.partyB));
  }
  for (const row of counts) {
    if (members.has(row.partyId)) continue;
    if (agreements.some((item) => item.partyA === row.partyId || item.partyB === row.partyId)) continue;
    rival = Math.max(rival, Number(row.seats));
  }
  return { bloc, rival, ahead: bloc > rival };
}
