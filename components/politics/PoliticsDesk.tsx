"use client";

import { useActionState, useState } from "react";
import { EntityMark } from "@/components/game/EntityMark";
import Link from "next/link";
import { DiplomacyPanel } from "@/components/politics/DiplomacyPanel";
import { ElectionBoard } from "@/components/politics/ElectionBoard";
import { ParliamentView } from "@/components/politics/ParliamentView";
import { selectionLabel } from "@/lib/politics/government-view";
import { politicsAction } from "@/lib/actions/politics";
import { ActionFeedback } from "@/components/feedback/ActionFeedback";
import type { ActionResult } from "@/lib/actions/account";
import { formatUtc } from "@/lib/world/clock";

const POLICY_EFFECTS: Record<string, string> = {
  sales_tax_percent: "A market purchase in this country pays floor(price × percent / 100) from the buyer to the treasury.",
  tariff_percent: "Goods shipped into this country from another country pay this amount instead of the default international tariff.",
  wage_floor: "A new job posting in this country cannot offer less than this wage. Postings that already exist stay as they are.",
  extraction_cost: "An extraction run charges this amount from the company instead of the site's stored operating cost.",
};

type Desk = {
  characterId: string;
  countryId: string;
  countryName: string;
  templates: { id: string; name: string; summary: string }[];
  constitution: { templateId: string; templateName: string; summary: string; restricted: boolean; version: number; note: string; parliamentSystem: string; parliamentSeats: number; executiveSelection: string } | null;
  offices: { officeKey: string; name: string; selection: string; isExecutive: boolean; mayAppoint: boolean; maySpend: boolean; mayPropose: boolean; mayDiplomacy: boolean; holder: string | null; holderParty: string | null }[];
  parties: { id: string; name: string; abbreviation: string; platform: string; members: number; balance: number; leader: string | null }[];
  members: { username: string; party: string }[];
  elections: { id: string; kind: string; status: string; officeKey: string | null; officeName: string | null; round: number; seatCount: number; secret: boolean; partyName: string | null; registering: boolean; voting: boolean; registrationEnds: string | Date; votingEnds: string | Date }[];
  candidates: { electionId: string; characterId: string; username: string; partyId: string | null; party: string | null; abbreviation: string | null; supportPoints: number }[];
  openTallies: { electionId: string; choiceId: string | null; choiceValue: string | null; votes: number; label: string | null }[];
  countedElections: { id: string; kind: string; officeKey: string | null; round: number; seatCount: number; votingEnds: string | Date; tallies: { label: string; votes: number }[] }[];
  bills: { id: string; title: string; body: string; status: string; effectKey: string; effectValue: number; thresholdPercent: number; sponsor: string | null; voting: boolean; votingEnds: string | Date; yes: number; no: number }[];
  events: { kind: string; detail: string; createdAt: string | Date }[];
  seats: { id: string; username: string | null; partyId: string | null; party: string | null; abbreviation: string | null }[];
  investigations: { id: string; username: string; reason: string }[];
  policies: { effectKey: string; effectValue: number }[];
  treasury: number;
  salesTax: number | null;
  relations: { iso2: string; name: string; status: string; note: string; updatedAt: string | Date }[];
  treaties: { title: string; status: string; iso2: string; name: string; createdAt: string | Date }[];
  diplomacyEvents: { kind: string; detail: string; createdAt: string | Date }[];
  coalition: { partyA: string; partyB: string; partyAId: string; partyBId: string } | null;
  countries: { id: string; iso2: string; name: string }[];
  canDiplomacy: boolean;
  atHome: boolean;
  homeIso2: string | null;
};

export function PoliticsDesk({ desk }: { desk: Desk }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(politicsAction, null);
  const [key] = useState(() => crypto.randomUUID());
  const [spendKey] = useState(() => crypto.randomUUID());
  const [eventKind, setEventKind] = useState("all");
  return (
    <div className="space-y-6">
      <ActionFeedback state={state} />
      <section className="panel">
        <h2 className="section-title">Game constitution</h2>
        {desk.constitution ? (
          <>
            <p className="mt-2">{desk.constitution.templateName} · version {desk.constitution.version}</p>
            <p className="text-sm text-muted">{desk.constitution.summary}</p>
            <p className="mt-2 text-sm text-muted">{desk.constitution.note}</p>
            {desk.constitution.restricted ? <p className="text-sm">New opposition parties are restricted in this game.</p> : null}
          </>
        ) : (
          <form action={action} className="mt-3 space-y-2">
            <p className="text-sm text-muted">No game government has been chosen. This choice does not describe the real-world state.</p>
            <input type="hidden" name="intent" value="adopt" />
            <input type="hidden" name="countryId" value={desk.countryId} />
            <select name="templateId" aria-label="Constitution template" className="field w-full">
              {desk.templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </select>
            <button disabled={pending} className="btn btn-primary">
              Adopt for your starting country
            </button>
          </form>
        )}
      </section>
      <section className="grid gap-3 sm:grid-cols-2">
        <div className="panel text-sm">
          <p className="kicker">Executive</p>
          {desk.offices.filter((office) => office.isExecutive).length === 0 ? <p className="mt-1 text-muted">No executive office is defined.</p> : null}
          <ul className="mt-1 space-y-1">
            {desk.offices.filter((office) => office.isExecutive).map((office) => (
              <li key={office.officeKey}>
                {office.name}: {office.holder ?? "vacant"}
                {office.holderParty ? ` · ${office.holderParty}` : ""}
              </li>
            ))}
          </ul>
        </div>
        <div className="panel text-sm">
          <p className="kicker">Current decisions</p>
          <p className="mt-1">{desk.coalition ? `Coalition: ${desk.coalition.partyA} and ${desk.coalition.partyB}.` : "No coalition agreement is active."}</p>
          <p>{desk.elections.length === 0 ? "No election is open." : `${desk.elections.length} open ${desk.elections.length === 1 ? "election" : "elections"}.`}</p>
          <p>{desk.bills.filter((bill) => bill.status === "voting").length === 0 ? "No bill is open for votes." : `${desk.bills.filter((bill) => bill.status === "voting").length} ${desk.bills.filter((bill) => bill.status === "voting").length === 1 ? "bill is" : "bills are"} open for votes.`}</p>
        </div>
      </section>
      <section>
        <h2 className="section-title">Offices</h2>
        {desk.offices.length === 0 ? <p className="mt-2 text-sm text-muted">No offices exist until a game constitution is adopted. Real-world officeholders are not shown.</p> : null}
        <ul className="mt-2 space-y-2 text-sm">
          {desk.offices.map((office) => {
            const powers = [
              office.isExecutive ? "executive" : "",
              office.mayAppoint ? "appoint" : "",
              office.maySpend ? "spend" : "",
              office.mayPropose ? "propose laws" : "",
              office.mayDiplomacy ? "diplomacy" : "",
            ].filter(Boolean);
            return (
              <li key={office.officeKey}>
                <p>
                  {office.name}: {office.holder ? <Link href={`/characters/${encodeURIComponent(office.holder)}`} className="text-gold">{office.holder}</Link> : "vacant"}
                  {office.holderParty ? <span className="text-muted"> · {office.holderParty}</span> : null}
                </p>
                <p className="text-xs text-muted">
                  {selectionLabel(office.selection)}
                  {powers.length > 0 ? ` Authority: ${powers.join(", ")}.` : ""}
                </p>
              </li>
            );
          })}
        </ul>
      </section>
      <section>
        <h2 className="section-title">Parliament</h2>
        {desk.constitution?.executiveSelection === "parliamentary" ? (
          <form action={action} className="mt-2" onSubmit={(event) => {
            if (!window.confirm("Form the government from your party or its coalition? The server seats you only when that bloc has more seats than any rival and the executive office is vacant.")) event.preventDefault();
          }}>
            <input type="hidden" name="intent" value="form" />
            <input type="hidden" name="countryId" value={desk.countryId} />
            <button disabled={pending} className="btn btn-secondary">
              Form government from the largest party
            </button>
          </form>
        ) : (
          <p className="mt-2 text-sm text-muted">This constitution does not form a government from parliament.</p>
        )}
        <ParliamentView
          seats={desk.seats}
          capacity={desk.constitution?.parliamentSeats ?? 0}
          parliamentSystem={desk.constitution?.parliamentSystem ?? "none"}
          executiveSelection={desk.constitution?.executiveSelection ?? "claim"}
          coalition={desk.coalition}
        />
        {desk.bills.some((bill) => bill.status === "voting") ? (
          <p className="mt-3 text-sm">
            <a href="#legislation" className="text-gold">
              {desk.bills.filter((bill) => bill.status === "voting").length} bill{desk.bills.filter((bill) => bill.status === "voting").length === 1 ? " is" : "s are"} open for votes
            </a>
          </p>
        ) : (
          <p className="mt-3 text-sm text-muted">No bill is open for votes.</p>
        )}
      </section>
      <section className="grid gap-3 sm:grid-cols-2">
        <div className="panel">
          <p className="kicker">Treasury balance</p>
          <p className="num mt-1 text-xl">{desk.treasury.toLocaleString("en-US")}</p>
        </div>
        <div className="panel">
          <p className="kicker">Sales tax</p>
          {desk.salesTax === null ? (
            <p className="mt-1 text-sm text-muted">No sales-tax law is in effect. A market purchase is unchanged.</p>
          ) : (
            <>
              <p className="num mt-1 text-xl">{desk.salesTax}%</p>
              <p className="mt-2 text-sm text-muted">{POLICY_EFFECTS.sales_tax_percent}</p>
            </>
          )}
          <ul className="mt-2 space-y-2 text-sm text-muted">
            {desk.policies.filter((policy) => policy.effectKey !== "sales_tax_percent").length === 0 ? (
              <li>No other policy is in effect.</li>
            ) : null}
            {desk.policies
              .filter((policy) => policy.effectKey !== "sales_tax_percent")
              .map((policy) => (
                <li key={policy.effectKey}>
                  {policy.effectKey.replaceAll("_", " ")} <span className="num">{policy.effectValue}</span>
                  {POLICY_EFFECTS[policy.effectKey] ? ` — ${POLICY_EFFECTS[policy.effectKey]}` : ""}
                </li>
              ))}
          </ul>
        </div>
      </section>
      <section>
        <h2 className="section-title">Parties</h2>
        {desk.parties.length === 0 ? <p className="mt-2 text-sm text-muted">No party has been founded.</p> : null}
        <ul className="mt-2 space-y-2">
          {desk.parties.map((party) => (
            <li key={party.id} className="panel text-sm">
              <div className="flex items-start gap-3">
                <EntityMark kind="party" code={party.abbreviation} toneSeed={party.id} label={party.name} />
                <div className="min-w-0">
              <h3 className="font-serif text-xl">
                {party.name} ({party.abbreviation})
              </h3>
              <p className="text-muted">{party.platform || "No platform text."}</p>
              <p>
                Leader {party.leader ?? "unrecorded"} · {party.members} members · {desk.seats.filter((seat) => seat.partyId === party.id).length} seated · treasury {party.balance}
              </p>
                </div>
              </div>
              <form action={action}>
                <input type="hidden" name="intent" value="join" />
                <input type="hidden" name="partyId" value={party.id} />
                <button disabled={pending} className="btn btn-secondary mt-2">
                  Join
                </button>
              </form>
            </li>
          ))}
        </ul>
        <form action={action} className="mt-3 grid gap-2">
          <input type="hidden" name="intent" value="party" />
          <input name="name" required aria-label="Party name" placeholder="Party name" className="field" />
          <input name="abbreviation" required aria-label="Abbreviation" placeholder="Abbreviation" className="field" />
          <textarea name="platform" aria-label="Platform in your own words" placeholder="Platform in your own words" className="field" />
          <button disabled={pending} className="btn btn-primary">
            Found party
          </button>
        </form>
        <form action={action} className="mt-2">
          <input type="hidden" name="intent" value="leave" />
          <button disabled={pending} className="btn btn-secondary">
            Leave your party
          </button>
        </form>
        <form action={action} className="mt-2 flex gap-2">
          <input type="hidden" name="intent" value="deposit" />
          <input type="hidden" name="idempotencyKey" value={key} />
          <input name="amount" type="number" min={1} aria-label="Deposit" placeholder="Deposit" className="field w-28" />
          <button disabled={pending} className="btn btn-secondary">
            Deposit to your party
          </button>
        </form>
      </section>
      {desk.constitution ? (
        <ElectionBoard
          elections={desk.elections}
          candidates={desk.candidates}
          tallies={desk.openTallies}
          counted={desk.countedElections}
          offices={desk.offices}
          countryId={desk.countryId}
          action={action}
          pending={pending}
        />
      ) : null}
      <section id="legislation" className="space-y-2">
        <h2 className="section-title">Legislation and spending</h2>
        <p className="text-sm text-muted">
          A bill is not in effect while it is voting. After the deadline, the world tick counts the recorded yes and no votes once. No votes, or a tie, rejects the bill and writes no policy. A passing bill writes one policy version. Counting it yourself uses that same result.
        </p>
        <ul className="space-y-1 text-sm text-muted">
          {Object.entries(POLICY_EFFECTS).map(([key, text]) => (
            <li key={key}>{text}</li>
          ))}
        </ul>
        <form action={action} className="grid gap-2">
          <input type="hidden" name="intent" value="bill" />
          <input type="hidden" name="countryId" value={desk.countryId} />
          <input name="title" aria-label="Bill title" placeholder="Bill title" className="field" />
          <textarea name="body" aria-label="What the bill does in the game" placeholder="What the bill does in the game" className="field" />
          <select name="effectKey" aria-label="Bill effect" className="field">
            <option value="sales_tax_percent">Sales tax percent (0–25)</option>
            <option value="tariff_percent">Tariff percent (0–25)</option>
            <option value="wage_floor">Wage floor (1–50)</option>
            <option value="extraction_cost">Extraction cost (1–20)</option>
          </select>
          <input name="effectValue" type="number" min={0} max={50} aria-label="Effect value" placeholder="Effect value" className="field" />
          <button disabled={pending} className="btn btn-secondary">Propose bill</button>
        </form>
        {desk.bills.length === 0 ? <p className="text-sm text-muted">No bill has been proposed.</p> : null}
        {desk.bills.map((bill) => (
          <div key={bill.id} className="panel text-sm">
            <p>
              {bill.title} · {bill.status} · {bill.effectKey.replaceAll("_", " ")} <span className="num">{bill.effectValue}</span>
            </p>
            <p className="mt-1 text-muted">
              {bill.sponsor ? `Proposed by ${bill.sponsor}. ` : ""}
              Threshold {bill.thresholdPercent}% of the recorded votes, and more yes than no.
            </p>
            {bill.body ? <p className="mt-1">{bill.body}</p> : null}
            <p className="mt-1 text-muted">
              <span className="num">{bill.yes}</span> yes · <span className="num">{bill.no}</span> no · voting ends {formatUtc(bill.votingEnds)}
            </p>
            {bill.yes + bill.no > 0 ? (
              <div className="chamber-bar mt-2" aria-hidden="true">
                <span className="chamber-bar-segment" data-tone="success" style={{ width: `${(bill.yes / (bill.yes + bill.no)) * 100}%` }} />
                <span className="chamber-bar-segment" data-tone="danger" style={{ width: `${(bill.no / (bill.yes + bill.no)) * 100}%` }} />
              </div>
            ) : null}
            <p className="mt-1 text-muted">
              {bill.status === "enacted"
                ? "This bill wrote a policy version."
                : bill.status === "rejected"
                  ? "This bill did not pass. No policy was written."
                  : bill.voting
                    ? "Votes are open. The world tick counts them after the deadline."
                    : "The deadline has passed. The next world tick counts these votes."}
            </p>
            {POLICY_EFFECTS[bill.effectKey] ? <p className="mt-1 text-muted">{POLICY_EFFECTS[bill.effectKey]}</p> : null}
            <form action={action} className="mt-2 inline" onSubmit={(event) => {
              const vote = (event.nativeEvent as SubmitEvent).submitter?.getAttribute("value");
              if (!window.confirm(`Record a ${vote === "no" ? "no" : "yes"} vote on this bill? A recorded vote cannot be changed.`)) event.preventDefault();
            }}>
              <input type="hidden" name="intent" value="vote-bill" />
              <input type="hidden" name="billId" value={bill.id} />
              <button name="vote" value="yes" disabled={pending || !bill.voting || bill.status !== "voting"} className="btn btn-secondary">Yes</button>
              <button name="vote" value="no" disabled={pending || !bill.voting || bill.status !== "voting"} className="btn btn-secondary ml-2">No</button>
            </form>
            <form action={action} className="mt-2 inline" onSubmit={(event) => {
              if (!window.confirm("Count this bill? A passing vote writes one policy. No votes, or a tie, rejects it and writes nothing.")) event.preventDefault();
            }}>
              <input type="hidden" name="intent" value="close-bill" />
              <input type="hidden" name="billId" value={bill.id} />
              <button disabled={pending || bill.voting || bill.status !== "voting"} className="btn btn-secondary ml-2">Count bill</button>
            </form>
          </div>
        ))}
        <form action={action} className="flex flex-wrap gap-2">
          <input type="hidden" name="intent" value="appoint" />
          <input type="hidden" name="countryId" value={desk.countryId} />
          <select name="officeKey" aria-label="Office to fill" className="field" defaultValue={desk.offices.find((office) => office.selection === "appointment")?.officeKey ?? ""}>
            {desk.offices.filter((office) => office.selection === "appointment").map((office) => (
              <option key={office.officeKey} value={office.officeKey}>
                {office.name}
              </option>
            ))}
          </select>
          {desk.members.length > 0 ? (
            <select name="username" aria-label="Party member" className="field">
              {desk.members.map((member) => (
                <option key={member.username} value={member.username}>
                  {member.username} · {member.party}
                </option>
              ))}
            </select>
          ) : (
            <input name="username" aria-label="Username" placeholder="Username" className="field" />
          )}
          <button disabled={pending || desk.offices.every((office) => office.selection !== "appointment")} className="btn btn-secondary">Appoint</button>
        </form>
        {desk.offices.every((office) => office.selection !== "appointment") ? <p className="text-sm text-muted">No office is filled by appointment.</p> : null}
        <form action={action} className="flex flex-wrap gap-2" onSubmit={(event) => {
          if (!window.confirm("Pay this amount from the government account? Paying your own character opens an investigation.")) event.preventDefault();
        }}>
          <input type="hidden" name="intent" value="spend" />
          <input type="hidden" name="countryId" value={desk.countryId} />
          <input type="hidden" name="idempotencyKey" value={spendKey} />
          <input name="username" aria-label="Pay username" placeholder="Pay username" className="field" />
          <input name="amount" type="number" min={1} aria-label="Amount" placeholder="Amount" className="field w-28" />
          <button disabled={pending} className="btn btn-secondary">Spend treasury</button>
        </form>
        <form action={action} className="flex flex-wrap gap-2">
          <input type="hidden" name="intent" value="coalition" />
          <input type="hidden" name="countryId" value={desk.countryId} />
          <select name="partyId" aria-label="Coalition party" className="field">
            {desk.parties.map((party) => (
              <option key={party.id} value={party.id}>
                {party.name}
              </option>
            ))}
          </select>
          <button disabled={pending || desk.parties.length < 2} className="btn btn-secondary">Sign coalition</button>
        </form>
        {desk.investigations.map((item) => (
          <form key={item.id} action={action} className="text-sm">
            <input type="hidden" name="intent" value="investigation" />
            <input type="hidden" name="investigationId" value={item.id} />
            <span>
              {item.username}: {item.reason}
            </span>
            <button name="ruling" value="uphold" disabled={pending} className="btn btn-secondary ml-2">Uphold</button>
            <button name="ruling" value="dismiss" disabled={pending} className="btn btn-secondary ml-2">Dismiss</button>
          </form>
        ))}
        {desk.offices.some((office) => office.selection === "succession" && !office.holder) ? (
          <>
            <form action={action} onSubmit={(event) => {
              if (!window.confirm("Claim the vacant monarchy for your character? The server accepts this only in your political home, and only while the office is empty.")) event.preventDefault();
            }}>
              <input type="hidden" name="intent" value="claim-monarchy" />
              <input type="hidden" name="countryId" value={desk.countryId} />
              <button disabled={pending} className="btn btn-secondary">Claim the vacant monarchy</button>
            </form>
            <form action={action} className="flex flex-wrap gap-2">
              <input type="hidden" name="intent" value="succession" />
              <input type="hidden" name="countryId" value={desk.countryId} />
              <input name="username" aria-label="Successor username" placeholder="Successor username" className="field" />
              <button disabled={pending} className="btn btn-secondary">Record game succession</button>
            </form>
          </>
        ) : null}
        <div className="flex flex-wrap gap-2">
          {desk.offices.some((office) => office.selection === "claim") ? (
            <>
              <form action={action} onSubmit={(event) => {
                if (!window.confirm("Claim the vacant ruler office? The server allows this for a party leader when no larger party exists.")) event.preventDefault();
              }}>
                <input type="hidden" name="intent" value="claim" />
                <input type="hidden" name="countryId" value={desk.countryId} />
                <button disabled={pending} className="btn btn-secondary">Claim vacant ruler office</button>
              </form>
              <form action={action} onSubmit={(event) => {
                if (!window.confirm("Challenge the ruler? The server replaces them only when your party has more members.")) event.preventDefault();
              }}>
                <input type="hidden" name="intent" value="challenge" />
                <input type="hidden" name="countryId" value={desk.countryId} />
                <button disabled={pending} className="btn btn-secondary">Challenge ruler</button>
              </form>
            </>
          ) : null}
          {desk.constitution?.templateId === "authoritarian" || desk.constitution?.templateId === "dictatorship" ? (
            <form action={action} onSubmit={(event) => {
              if (!window.confirm("Restrict new opposition parties under this game constitution?")) event.preventDefault();
            }}>
              <input type="hidden" name="intent" value="emergency" />
              <input type="hidden" name="countryId" value={desk.countryId} />
              <button disabled={pending} className="btn btn-secondary">Declare emergency restrictions</button>
            </form>
          ) : null}
        </div>
      </section>
      <DiplomacyPanel
        countryName={desk.countryName}
        homeIso2={desk.homeIso2}
        canAct={desk.canDiplomacy}
        atHome={desk.atHome}
        relations={desk.relations}
        treaties={desk.treaties}
        events={desk.diplomacyEvents}
        countries={desk.countries}
        coalition={desk.coalition}
        action={action}
        pending={pending}
      />
      <section className="panel">
        <h2 className="section-title">Recent game events</h2>
        <p className="text-sm text-muted">The latest stored records for this country. This is not a complete archive.</p>
        <label className="mt-2 block text-sm">
          Event type
          <select className="field" value={eventKind} onChange={(event) => setEventKind(event.target.value)}>
            <option value="all">All stored kinds</option>
            {[...new Set(desk.events.map((item) => item.kind))].map((kind) => (
              <option key={kind} value={kind}>{kind}</option>
            ))}
          </select>
        </label>
        {desk.events.length === 0 ? <p className="mt-2 text-sm text-muted">No political events have been recorded.</p> : null}
        <ul className="mt-2 space-y-1 text-sm">
          {desk.events.filter((item) => eventKind === "all" || item.kind === eventKind).map((item, index) => (
            <li key={`${item.kind}-${index}`}>
              <p>
                {item.kind}: {item.detail}
              </p>
              <p className="text-xs text-faint">{formatUtc(item.createdAt)}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
