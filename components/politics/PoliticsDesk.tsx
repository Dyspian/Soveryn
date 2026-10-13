"use client";

import { useActionState, useState } from "react";
import { politicsAction } from "@/lib/actions/politics";
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
  constitution: { templateName: string; summary: string; restricted: boolean; version: number; note: string } | null;
  offices: { officeKey: string; name: string; holder: string | null }[];
  parties: { id: string; name: string; abbreviation: string; platform: string; members: number; balance: number }[];
  elections: { id: string; kind: string; status: string; officeKey: string | null; registering: boolean; voting: boolean }[];
  bills: { id: string; title: string; status: string; effectKey: string; effectValue: number; voting: boolean; votingEnds: string | Date; yes: number; no: number }[];
  events: { kind: string; detail: string; createdAt: string | Date }[];
  seats: { username: string; party: string | null }[];
  investigations: { id: string; username: string; reason: string }[];
  policies: { effectKey: string; effectValue: number }[];
  treasury: number;
  salesTax: number;
  relations: { iso2: string; name: string; status: string; note: string; updatedAt: string | Date }[];
  treaties: { title: string; status: string; iso2: string; name: string; createdAt: string | Date }[];
  coalition: { partyA: string; partyB: string } | null;
  countries: { id: string; iso2: string; name: string }[];
};

export function PoliticsDesk({ desk }: { desk: Desk }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(politicsAction, null);
  const [key] = useState(() => crypto.randomUUID());
  const [spendKey] = useState(() => crypto.randomUUID());
  return (
    <div className="space-y-6">
      {state?.ok ? <p className="text-sm text-gold">{state.message}</p> : null}
      {state && !state.ok ? <p className="text-sm text-danger">{state.error}</p> : null}
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
      <section>
        <h2 className="section-title">Offices</h2>
        {desk.offices.length === 0 ? <p className="mt-2 text-sm text-muted">No offices exist until a game constitution is adopted. Real-world officeholders are not shown.</p> : null}
        <ul className="mt-2 space-y-1 text-sm">
          {desk.offices.map((office) => (
            <li key={office.officeKey}>
              {office.name}: {office.holder ?? "vacant"}
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h2 className="section-title">Parliament</h2>
        <form action={action} className="mt-2">
          <input type="hidden" name="intent" value="form" />
          <input type="hidden" name="countryId" value={desk.countryId} />
          <button disabled={pending} className="btn btn-secondary">
            Form government from the largest party
          </button>
        </form>
        {desk.seats.length === 0 ? <p className="mt-2 text-sm text-muted">No game seats have been filled.</p> : null}
        <ul className="mt-2 text-sm">
          {desk.seats.map((seat) => (
            <li key={`${seat.username}-${seat.party}`}>
              {seat.username} · {seat.party ?? "independent"}
            </li>
          ))}
        </ul>
      </section>
      <section className="grid gap-3 sm:grid-cols-2">
        <div className="panel">
          <p className="kicker">Treasury balance</p>
          <p className="num mt-1 text-xl">{desk.treasury.toLocaleString("en-US")}</p>
        </div>
        <div className="panel">
          <p className="kicker">Sales tax</p>
          <p className="num mt-1 text-xl">{desk.salesTax}%</p>
          <p className="mt-2 text-sm text-muted">{POLICY_EFFECTS.sales_tax_percent}</p>
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
              <h3 className="font-serif text-xl">
                {party.name} ({party.abbreviation})
              </h3>
              <p className="text-muted">{party.platform || "No platform text."}</p>
              <p>
                {party.members} members · treasury {party.balance}
              </p>
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
        <section className="space-y-2">
          <h2 className="section-title">Elections</h2>
          <form action={action} className="flex flex-wrap gap-2">
            <input type="hidden" name="intent" value="schedule" />
            <input type="hidden" name="countryId" value={desk.countryId} />
            <select name="kind" aria-label="Election kind" className="field">
              <option value="fptp_office">First past the post</option>
              <option value="two_round">Two-round</option>
              <option value="pr_parliament">Proportional parliament</option>
              <option value="party_leadership">Party leadership</option>
              <option value="confidence">Confidence</option>
            </select>
            <select name="officeKey" aria-label="Office" className="field">
              {desk.offices.map((office) => (
                <option key={office.officeKey} value={office.officeKey}>
                  {office.name}
                </option>
              ))}
            </select>
            <button disabled={pending} className="btn btn-secondary">
              Schedule
            </button>
          </form>
          {desk.elections.length === 0 ? <p className="text-sm text-muted">No election is open.</p> : null}
          {desk.elections.map((election) => (
            <div key={election.id} className="panel text-sm">
              <p>
                {election.kind} {election.officeKey ?? ""} · {election.registering ? "registration" : election.voting ? "voting" : "ready to count"} · {election.status}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <form action={action}>
                  <input type="hidden" name="intent" value="advance" />
                  <input type="hidden" name="electionId" value={election.id} />
                  <button disabled={pending} className="btn btn-secondary">Advance period</button>
                </form>
                <form action={action}>
                  <input type="hidden" name="intent" value="register" />
                  <input type="hidden" name="electionId" value={election.id} />
                  <button disabled={pending} className="btn btn-secondary">Register</button>
                </form>
                <form action={action}>
                  <input type="hidden" name="intent" value="speech" />
                  <input type="hidden" name="electionId" value={election.id} />
                  <button disabled={pending} className="btn btn-secondary">Speech</button>
                </form>
                <form action={action} className="flex gap-2">
                  <input type="hidden" name="intent" value="vote" />
                  <input type="hidden" name="electionId" value={election.id} />
                  <input type="hidden" name="choiceKind" value={election.kind === "pr_parliament" ? "party" : election.kind === "confidence" ? "yesno" : "character"} />
                  <input name="choiceId" defaultValue={election.kind === "pr_parliament" ? "" : desk.characterId} aria-label="Candidate or party id" placeholder="Candidate or party id" className="field" />
                  <input name="choiceValue" aria-label="yes or no" placeholder="yes or no" className="field w-24" />
                  <button disabled={pending} className="btn btn-primary">Vote</button>
                </form>
                <form action={action}>
                  <input type="hidden" name="intent" value="close" />
                  <input type="hidden" name="electionId" value={election.id} />
                  <button disabled={pending} className="btn btn-secondary">Count</button>
                </form>
              </div>
            </div>
          ))}
        </section>
      ) : null}
      <section className="space-y-2">
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
              <span className="num">{bill.yes}</span> yes · <span className="num">{bill.no}</span> no · voting ends {formatUtc(bill.votingEnds)}
            </p>
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
            <form action={action} className="mt-2 inline">
              <input type="hidden" name="intent" value="vote-bill" />
              <input type="hidden" name="billId" value={bill.id} />
              <button name="vote" value="yes" disabled={pending || !bill.voting || bill.status !== "voting"} className="btn btn-secondary">Yes</button>
              <button name="vote" value="no" disabled={pending || !bill.voting || bill.status !== "voting"} className="btn btn-secondary ml-2">No</button>
            </form>
            <form action={action} className="mt-2 inline">
              <input type="hidden" name="intent" value="close-bill" />
              <input type="hidden" name="billId" value={bill.id} />
              <button disabled={pending || bill.voting || bill.status !== "voting"} className="btn btn-secondary ml-2">Count bill</button>
            </form>
          </div>
        ))}
        <form action={action} className="flex flex-wrap gap-2">
          <input type="hidden" name="intent" value="appoint" />
          <input type="hidden" name="countryId" value={desk.countryId} />
          <input name="officeKey" aria-label="Office key" placeholder="Office key" className="field" />
          <input name="username" aria-label="Username" placeholder="Username" className="field" />
          <button disabled={pending} className="btn btn-secondary">Appoint</button>
        </form>
        <form action={action} className="flex flex-wrap gap-2">
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
        <form action={action} className="flex flex-wrap gap-2">
          <input type="hidden" name="intent" value="succession" />
          <input type="hidden" name="countryId" value={desk.countryId} />
          <input name="username" aria-label="Successor username" placeholder="Successor username" className="field" />
          <button disabled={pending} className="btn btn-secondary">Record game succession</button>
        </form>
        <div className="flex flex-wrap gap-2">
          <form action={action}>
            <input type="hidden" name="intent" value="claim" />
            <input type="hidden" name="countryId" value={desk.countryId} />
            <button disabled={pending} className="btn btn-secondary">Claim vacant ruler office</button>
          </form>
          <form action={action}>
            <input type="hidden" name="intent" value="challenge" />
            <input type="hidden" name="countryId" value={desk.countryId} />
            <button disabled={pending} className="btn btn-secondary">Challenge ruler</button>
          </form>
          <form action={action}>
            <input type="hidden" name="intent" value="emergency" />
            <input type="hidden" name="countryId" value={desk.countryId} />
            <button disabled={pending} className="btn btn-secondary">Declare emergency restrictions</button>
          </form>
        </div>
      </section>
      <section className="panel space-y-3">
        <h2 className="section-title">Diplomacy</h2>
        <p className="text-sm text-muted">Statuses and treaties are game records. A treaty has no military effect, and a sanction only blocks the routes the server already checks.</p>
        {desk.coalition ? (
          <p className="text-sm">
            Active coalition: {desk.coalition.partyA} and {desk.coalition.partyB}
          </p>
        ) : (
          <p className="text-sm text-muted">No coalition agreement is active.</p>
        )}
        {desk.relations.length === 0 ? <p className="text-sm text-muted">No diplomatic status is recorded with another country.</p> : null}
        <ul className="space-y-2 text-sm">
          {desk.relations.map((relation) => (
            <li key={relation.iso2} className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line pb-2">
              <span>
                {relation.name} <span className="text-muted">({relation.iso2})</span>
              </span>
              <span className={relation.status === "sanctioned" ? "text-danger" : "text-ink"}>{relation.status}</span>
              <span className="w-full text-xs text-faint">
                {relation.note ? `${relation.note} · ` : ""}
                Updated {formatUtc(relation.updatedAt)}
              </span>
            </li>
          ))}
        </ul>
        {desk.treaties.length === 0 ? <p className="text-sm text-muted">No treaty is signed.</p> : null}
        <ul className="space-y-2 text-sm">
          {desk.treaties.map((treaty) => (
            <li key={`${treaty.iso2}-${treaty.title}`}>
              {treaty.title} · {treaty.name} · {treaty.status}
              <span className="block text-xs text-faint">{formatUtc(treaty.createdAt)}</span>
            </li>
          ))}
        </ul>
        <form action={action} className="grid gap-2 sm:grid-cols-2">
          <p className="text-sm text-muted sm:col-span-2">Set a status with another country. The server allows this only for an office that may conduct diplomacy.</p>
          <input type="hidden" name="intent" value="diplomacy" />
          <select name="otherCountryId" aria-label="Other country" className="field" defaultValue={desk.countries[0]?.id ?? ""}>
            {desk.countries.map((country) => (
              <option key={country.id} value={country.id}>
                {country.name}
              </option>
            ))}
          </select>
          <select name="status" aria-label="Diplomatic status" className="field" defaultValue="neutral">
            <option value="friendly">Friendly</option>
            <option value="neutral">Neutral</option>
            <option value="strained">Strained</option>
            <option value="sanctioned">Sanctioned</option>
          </select>
          <input name="note" maxLength={200} aria-label="Short note" placeholder="Short note" className="field sm:col-span-2" />
          <button disabled={pending} className="btn btn-secondary">
            Save status
          </button>
        </form>
        <form action={action} className="flex flex-wrap items-end gap-2">
          <label className="text-sm">
            Other country
            <select name="iso2" className="field" defaultValue={desk.countries[0]?.iso2 ?? ""}>
              {desk.countries.map((country) => (
                <option key={country.iso2} value={country.iso2}>
                  {country.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Treaty title
            <input name="title" aria-label="Short title" placeholder="Short title" className="field" />
          </label>
          <input type="hidden" name="intent" value="treaty" />
          <button disabled={pending} className="btn btn-secondary">
            Sign treaty
          </button>
        </form>
      </section>
      <section className="panel">
        <h2 className="section-title">Recent game events</h2>
        {desk.events.length === 0 ? <p className="mt-2 text-sm text-muted">No political events have been recorded.</p> : null}
        <ul className="mt-2 space-y-1 text-sm">
          {desk.events.map((item, index) => (
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
