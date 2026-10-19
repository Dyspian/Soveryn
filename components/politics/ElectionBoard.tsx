"use client";

import Link from "next/link";
import { useState } from "react";
import { EntityMark } from "@/components/game/EntityMark";
import { electionLabel } from "@/lib/politics/government-view";
import { formatUtc } from "@/lib/world/clock";

type Election = {
  id: string;
  kind: string;
  status: string;
  officeKey: string | null;
  officeName: string | null;
  round: number;
  seatCount: number;
  secret: boolean;
  partyName: string | null;
  registering: boolean;
  voting: boolean;
  registrationEnds: string | Date;
  votingEnds: string | Date;
};

type Candidate = {
  electionId: string;
  characterId: string;
  username: string;
  partyId: string | null;
  party: string | null;
  abbreviation: string | null;
  supportPoints: number;
};

type Tally = { electionId: string; choiceId: string | null; choiceValue: string | null; votes: number; label: string | null };

type Counted = {
  id: string;
  kind: string;
  officeKey: string | null;
  round: number;
  seatCount: number;
  votingEnds: string | Date;
  tallies: { label: string; votes: number }[];
};

function confirmAction(event: React.FormEvent<HTMLFormElement>, message: string) {
  if (!window.confirm(message)) event.preventDefault();
}

export function ElectionBoard({
  elections,
  candidates,
  tallies,
  counted,
  offices,
  countryId,
  action,
  pending,
}: {
  elections: Election[];
  candidates: Candidate[];
  tallies: Tally[];
  counted: Counted[];
  offices: { officeKey: string; name: string; selection: string }[];
  countryId: string;
  action: (payload: FormData) => void;
  pending: boolean;
}) {
  const [kind, setKind] = useState("fptp_office");
  const electedOffices = offices.filter((office) => office.selection === "election_fptp");
  const needsOffice = kind === "fptp_office" || kind === "two_round";

  return (
    <section className="space-y-3">
      <h2 className="section-title">Elections</h2>
      <p className="text-sm text-muted">
        Registration and voting use the stored deadlines. One ballot is kept per voter per round. A speech costs 5 currency and adds campaign attention used to order a party list. It does not add votes.
      </p>
      <form action={action} className="flex flex-wrap items-end gap-2" onSubmit={(event) => confirmAction(event, "Schedule this election? The server checks that a party leader or the executive may open it.")}>
        <input type="hidden" name="intent" value="schedule" />
        <input type="hidden" name="countryId" value={countryId} />
        <label className="text-sm">
          Type
          <select name="kind" aria-label="Election kind" className="field" value={kind} onChange={(event) => setKind(event.target.value)}>
            <option value="fptp_office">First past the post</option>
            <option value="two_round">Two-round</option>
            <option value="pr_parliament">Proportional parliament</option>
            <option value="party_leadership">Party leadership</option>
            <option value="confidence">Confidence</option>
          </select>
        </label>
        {needsOffice ? (
          <label className="text-sm">
            Office
            <select name="officeKey" aria-label="Office" className="field" defaultValue={electedOffices[0]?.officeKey ?? ""}>
              {electedOffices.map((office) => (
                <option key={office.officeKey} value={office.officeKey}>
                  {office.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <button disabled={pending || (needsOffice && electedOffices.length === 0)} className="btn btn-secondary">
          Schedule
        </button>
      </form>
      {needsOffice && electedOffices.length === 0 ? <p className="text-sm text-muted">No office in this constitution is filled by a direct election.</p> : null}
      {elections.length === 0 ? <p className="text-sm text-muted">No election is open.</p> : null}
      {elections.map((election) => {
        const people = candidates.filter((candidate) => candidate.electionId === election.id);
        const results = tallies.filter((row) => row.electionId === election.id);
        const total = results.reduce((sum, row) => sum + Number(row.votes), 0);
        const parties = [...new Map(people.filter((person) => person.partyId).map((person) => [person.partyId, person])).values()];
        const phase = election.registering ? "registration" : election.voting ? "voting" : "ready to count";
        return (
          <article key={election.id} className="panel space-y-2 text-sm">
            <h3 className="font-medium">
              {electionLabel(election.kind)}
              {election.officeName ? ` · ${election.officeName}` : ""}
              {election.partyName ? ` · ${election.partyName}` : ""}
            </h3>
            <p className="text-muted">
              {phase} · {election.status}
              {election.round > 1 ? ` · round ${election.round}` : ""}
              {election.kind === "pr_parliament" ? ` · ${election.seatCount} seats by D'Hondt` : ""}
            </p>
            <p className="text-xs text-muted">
              {election.registering ? `Registration closes ${formatUtc(election.registrationEnds)}. ` : ""}
              Voting closes {formatUtc(election.votingEnds)}.
            </p>
            {election.kind === "confidence" ? <p className="text-xs text-muted">Only a sitting member can vote. The vote is yes or no and is not a secret ballot.</p> : null}
            {people.length === 0 && election.kind !== "confidence" ? <p className="text-muted">No candidate is registered for this round.</p> : null}
            <ul className="space-y-1">
              {people.map((person) => (
                <li key={person.characterId} className="flex flex-wrap items-center gap-2">
                  <EntityMark kind="party" code={person.abbreviation || person.party || "IND"} toneSeed={person.partyId ?? person.characterId} label={person.party ?? "Independent"} size="sm" />
                  <Link href={`/characters/${encodeURIComponent(person.username)}`} className="text-gold">
                    {person.username}
                  </Link>
                  <span className="text-muted">{person.party ?? "Independent"} · campaign attention {person.supportPoints}</span>
                </li>
              ))}
            </ul>
            {results.length > 0 ? (
              <div>
                <p className="text-xs text-muted">{election.secret ? "Recorded ballots after voting closed." : "Recorded yes and no votes."}</p>
                <ul className="mt-1 space-y-1">
                  {results.map((row) => (
                    <li key={`${row.choiceId ?? row.choiceValue}`}>
                      {row.label || "Unnamed choice"} · <span className="num">{row.votes}</span> of <span className="num">{total}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : election.secret && (election.registering || election.voting) ? (
              <p className="text-xs text-muted">Ballots stay unlisted while this election is open.</p>
            ) : (
              <p className="text-xs text-muted">No ballot is recorded for this round.</p>
            )}
            <div className="flex flex-wrap gap-2">
              <form action={action} onSubmit={(event) => confirmAction(event, "Close the current election period?")}>
                <input type="hidden" name="intent" value="advance" />
                <input type="hidden" name="electionId" value={election.id} />
                <button disabled={pending || (!election.registering && !election.voting)} className="btn btn-secondary">Advance period</button>
              </form>
              {election.kind !== "confidence" ? (
                <form action={action} onSubmit={(event) => confirmAction(event, "Register for this round? The server checks your level, country, and party.")}>
                  <input type="hidden" name="intent" value="register" />
                  <input type="hidden" name="electionId" value={election.id} />
                  <button disabled={pending || !election.registering} className="btn btn-secondary">Register</button>
                </form>
              ) : null}
              {election.kind !== "confidence" ? (
                <form action={action} onSubmit={(event) => confirmAction(event, "Pay 5 currency for a speech? It adds campaign attention and does not add votes.")}>
                  <input type="hidden" name="intent" value="speech" />
                  <input type="hidden" name="electionId" value={election.id} />
                  <button disabled={pending || election.registering || !election.voting} className="btn btn-secondary">Speech</button>
                </form>
              ) : null}
              <form
                action={action}
                className="flex flex-wrap gap-2"
                onSubmit={(event) => confirmAction(event, "Record this ballot? One vote is kept for this round.")}
              >
                <input type="hidden" name="intent" value="vote" />
                <input type="hidden" name="electionId" value={election.id} />
                {election.kind === "confidence" ? (
                  <>
                    <input type="hidden" name="choiceKind" value="yesno" />
                    <select name="choiceValue" aria-label="Confidence vote" className="field" defaultValue="yes">
                      <option value="yes">Yes</option>
                      <option value="no">No</option>
                    </select>
                  </>
                ) : election.kind === "pr_parliament" ? (
                  <>
                    <input type="hidden" name="choiceKind" value="party" />
                    <select name="choiceId" aria-label="Party list" className="field" defaultValue={parties[0]?.partyId ?? ""}>
                      {parties.map((party) => (
                        <option key={party.partyId ?? party.characterId} value={party.partyId ?? ""}>
                          {party.party}
                        </option>
                      ))}
                    </select>
                  </>
                ) : (
                  <>
                    <input type="hidden" name="choiceKind" value="character" />
                    <select name="choiceId" aria-label="Candidate" className="field" defaultValue={people[0]?.characterId ?? ""}>
                      {people.map((person) => (
                        <option key={person.characterId} value={person.characterId}>
                          {person.username}
                          {person.party ? ` · ${person.party}` : ""}
                        </option>
                      ))}
                    </select>
                  </>
                )}
                <button
                  disabled={pending || election.registering || !election.voting || (election.kind !== "confidence" && (election.kind === "pr_parliament" ? parties.length === 0 : people.length === 0))}
                  className="btn btn-primary"
                >
                  Vote
                </button>
              </form>
              <form action={action} onSubmit={(event) => confirmAction(event, "Count this election? The server uses the recorded ballots and installs nobody on a tie.")}>
                <input type="hidden" name="intent" value="close" />
                <input type="hidden" name="electionId" value={election.id} />
                <button disabled={pending || election.registering || election.voting} className="btn btn-secondary">Count</button>
              </form>
            </div>
          </article>
        );
      })}
      <div>
        <h3 className="text-sm font-medium">Counted elections</h3>
        <p className="mt-1 text-xs text-muted">The latest stored closed elections. This is not a full archive.</p>
        {counted.length === 0 ? <p className="mt-2 text-sm text-muted">No counted election is stored.</p> : null}
        <ul className="mt-2 space-y-2 text-sm">
          {counted.map((election) => {
            const total = election.tallies.reduce((sum, row) => sum + row.votes, 0);
            return (
              <li key={election.id} className="border border-line px-3 py-2">
                <p>
                  {electionLabel(election.kind)}
                  {election.officeKey ? ` · ${election.officeKey}` : ""} · closed {formatUtc(election.votingEnds)}
                </p>
                {election.tallies.length === 0 ? <p className="text-muted">No ballot was recorded.</p> : null}
                <ul>
                  {election.tallies.map((row) => (
                    <li key={row.label}>
                      {row.label} · <span className="num">{row.votes}</span> of <span className="num">{total}</span>
                    </li>
                  ))}
                </ul>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
