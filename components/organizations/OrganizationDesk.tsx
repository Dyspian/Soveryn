"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { organizationsAction } from "@/lib/actions/organizations";
import type { ActionResult } from "@/lib/actions/account";
import { Portrait } from "@/components/brand/Portrait";
import { OPERATIONS, PERMISSIONS, RANK_KEYS } from "@/lib/organizations/domain";
import { formatUtc } from "@/lib/world/clock";

const PERMISSION_LABELS: Record<string, string> = {
  invite: "invite members",
  approve: "approve applications",
  remove: "remove members",
  promote: "change ranks",
  edit: "edit the organization",
  withdraw: "withdraw treasury funds",
  approve_spend: "approve a withdrawal",
  start_operations: "prepare contracts",
  startOperations: "prepare contracts",
  locations: "add operational cities",
  treaties: "propose agreements",
  rivalries: "declare rivalries",
  market: "list on the underground market",
  reports: "view the treasury ledger",
  settings: "change rank permissions",
  dissolve: "dissolve the organization",
};

const TABS = ["Overview", "Members", "Treasury", "Operations", "Underground", "Diplomacy", "Record"] as const;

type Desk = {
  org: {
    id: string;
    name: string;
    tag: string;
    description: string;
    emblemKey: string | null;
    typeLabel: string;
    leader: string;
    city: string;
    country: string;
    balance: number;
    reputation: number;
    influence: number;
    memberLimit: number;
    recruitment: string;
    visibility: string;
    status: string;
    createdAt: string | Date;
  };
  member: {
    rankKey: string;
    reports: boolean;
    withdraw: boolean;
    startOperations: boolean;
    invite: boolean;
    approve: boolean;
    promote: boolean;
    remove: boolean;
    treaties: boolean;
    rivalries: boolean;
    market: boolean;
    locations: boolean;
    dissolve: boolean;
    settings: boolean;
  } | null;
  members: { username: string; rankName: string; founder: boolean; joinedAt: string | Date }[];
  events: { kind: string; detail: string; createdAt: string | Date }[];
  operations: { id: string; definitionKey: string; status: string; summary: string | null; completesAt: string | Date | null; openedBy: boolean; joined: boolean; recorded: number; credited: boolean }[];
  influence: { city: string; score: number }[];
  relations: { otherId: string; other: string; status: string; proposal: string | null }[];
  ledger: { reason: string; amount: number | string; direction: string; createdAt: string | Date }[];
  locations: { name: string }[];
  contests: {
    id: string;
    status: string;
    outcome: string;
    stake: number;
    city: string;
    challenger: string;
    defender: string;
    challengerId: string;
    defenderId: string;
    resolvesAt: string | Date | null;
    support: number;
  }[];
  applications: { id: string; username: string }[];
};

export function OrganizationDesk({
  desk,
  status,
  listings,
  places,
  products,
  peers,
  deliveries,
}: {
  desk: Desk;
  status: { heat: number; wanted: string; fines: number; planning: number; concealment: number } | null;
  listings: { id: string; product: string; quantity: number; unitPrice: number; city: string; iso2: string }[];
  places: { id: string; name: string }[];
  products: { id: string; name: string }[];
  peers: { id: string; name: string; tag: string }[];
  deliveries: { id: string; status: string; product: string; quantity: number; payment: number; origin: string; destination: string; poster: boolean; carrier: boolean }[];
}) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(organizationsAction, null);
  const [tab, setTab] = useState<(typeof TABS)[number] | "Settings">("Overview");
  const [memberQuery, setMemberQuery] = useState("");
  const [key, setKey] = useState("");
  const [withdrawKey, setWithdrawKey] = useState("");
  const [leadKey, setLeadKey] = useState("");
  const [dissolveKey, setDissolveKey] = useState("");
  const [listKey, setListKey] = useState("");
  const [deliveryKey, setDeliveryKey] = useState("");
  const [fineKey, setFineKey] = useState("");
  useEffect(() => {
    setKey(crypto.randomUUID());
    setWithdrawKey(crypto.randomUUID());
    setLeadKey(crypto.randomUUID());
    setDissolveKey(crypto.randomUUID());
    setListKey(crypto.randomUUID());
    setDeliveryKey(crypto.randomUUID());
    setFineKey(crypto.randomUUID());
  }, []);
  const org = desk.org;
  const permissions = desk.member
    ? Object.entries(desk.member)
        .filter((entry) => entry[1] === true && entry[0] !== "rankKey" && entry[0] !== "isFounder")
        .map(([name]) => PERMISSION_LABELS[name] ?? name)
    : [];
  const attention = [
    desk.applications.length > 0 && desk.member?.approve ? `${desk.applications.length} application${desk.applications.length === 1 ? "" : "s"} waiting` : "",
    desk.operations.some((operation) => operation.status === "in_progress") ? "A contract is in progress" : "",
    desk.relations.some((relation) => relation.proposal) ? "A relationship proposal is waiting" : "",
    status && status.fines > 0 ? `A fine of ${status.fines} is unpaid` : "",
  ].filter(Boolean);
  const members = desk.members.filter((member) => member.username.toLowerCase().includes(memberQuery.trim().toLowerCase()));
  const tabs = desk.member ? [...TABS, "Settings" as const] : [...TABS];

  return (
    <div className="space-y-6">
      {state?.ok ? <p className="text-sm text-gold">{state.message}</p> : null}
      {state && !state.ok ? <p className="text-sm text-danger" role="alert">{state.error}</p> : null}
      <header className="flex items-start gap-4">
        {org.emblemKey ? <Portrait portraitKey={org.emblemKey} className="h-14 w-14 shrink-0" /> : null}
        <div>
          <p className="kicker">Organization</p>
          <h1 className="page-title">
            {org.name} <span className="text-gold">[{org.tag}]</span>
          </h1>
          <p className="mt-2 text-sm text-muted">{org.typeLabel}</p>
          <p className="mt-2">{org.description || "No description."}</p>
        </div>
      </header>
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Organization sections">
        {tabs.map((item) => (
          <button key={item} type="button" role="tab" aria-selected={tab === item} className={tab === item ? "btn btn-primary" : "btn btn-secondary"} onClick={() => setTab(item)}>
            {item}
          </button>
        ))}
      </div>

      {tab === "Overview" ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat label="Treasury" value={org.balance.toLocaleString("en-US")} />
            <Stat label="Members" value={`${desk.members.length}/${org.memberLimit}`} />
            <Stat label="Your role" value={desk.member ? desk.member.rankKey : "Not a member"} />
          </div>
          <p className="text-sm">
            Leader {org.leader} · {org.city}, {org.country} · reputation {org.reputation} · influence {org.influence}
          </p>
          <p className="text-sm text-muted">
            {org.visibility} · recruitment {org.recruitment} · {org.status} · established {formatUtc(org.createdAt)}. Headquarters are a game location, not territorial control.
          </p>
          {permissions.length > 0 ? <p className="text-sm text-muted">You can {permissions.join(", ")}.</p> : null}
          {desk.member && permissions.length === 0 ? <p className="text-sm text-muted">This rank has no management permissions.</p> : null}
          <section className="panel space-y-2">
            <h2 className="section-title">Needs attention</h2>
            {attention.length === 0 ? <p className="text-sm text-muted">Nothing in the stored records needs a decision.</p> : null}
            <ul className="text-sm">
              {attention.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
          <section className="panel space-y-2">
            <h2 className="section-title">Conflict</h2>
            <p className="text-sm text-muted">
              There is no warfare and no change of country. A rivalry can open a presence contest for an open starting city. Both treasuries pay the stake when it is accepted. Recorded support plus the stored influence score decide the result. The winner&apos;s influence rises. The city is not transferred.
            </p>
            {desk.contests.length === 0 ? <p className="text-sm text-muted">No city contest is recorded.</p> : null}
            <ul className="space-y-2">
              {desk.contests.map((contest) => (
                <li key={contest.id} className="text-sm">
                  <p>
                    {contest.city} · {contest.challenger} and {contest.defender} · {contest.status}
                    {contest.status === "resolved" ? ` · ${contest.outcome}` : ""} · stake <span className="num">{contest.stake}</span>
                  </p>
                  <p className="text-muted">
                    Your recorded support <span className="num">{contest.support}</span>
                    {contest.resolvesAt ? ` · resolves ${formatUtc(contest.resolvesAt)}` : ""}
                  </p>
                  {desk.member && contest.status === "proposed" && contest.defenderId === org.id && desk.member.rivalries ? (
                    <form action={action}>
                      <input type="hidden" name="intent" value="contest-accept" />
                      <input type="hidden" name="organizationId" value={org.id} />
                      <input type="hidden" name="contestId" value={contest.id} />
                      <button disabled={pending} className="btn btn-primary mt-1">Accept and pay the stake</button>
                    </form>
                  ) : null}
                  {desk.member && contest.status === "proposed" && desk.member.rivalries ? (
                    <form action={action}>
                      <input type="hidden" name="intent" value="contest-cancel" />
                      <input type="hidden" name="organizationId" value={org.id} />
                      <input type="hidden" name="contestId" value={contest.id} />
                      <button disabled={pending} className="btn btn-secondary mt-1">Cancel proposal</button>
                    </form>
                  ) : null}
                  {desk.member && contest.status === "active" ? (
                    <form action={action}>
                      <input type="hidden" name="intent" value="contest-support" />
                      <input type="hidden" name="organizationId" value={org.id} />
                      <input type="hidden" name="contestId" value={contest.id} />
                      <button disabled={pending} className="btn btn-secondary mt-1">Record support</button>
                    </form>
                  ) : null}
                </li>
              ))}
            </ul>
            {desk.member?.rivalries ? (
              <form action={action} className="grid gap-2">
                <input type="hidden" name="intent" value="contest-propose" />
                <input type="hidden" name="organizationId" value={org.id} />
                <label className="text-sm">
                  Rival
                  <select name="otherOrganizationId" className="field">
                    {desk.relations.filter((relation) => relation.status === "rival").map((relation) => (
                      <option key={relation.otherId} value={relation.otherId}>{relation.other}</option>
                    ))}
                  </select>
                </label>
                <label className="text-sm">
                  Open starting city
                  <select name="placeId" className="field">
                    {places.map((place) => (
                      <option key={place.id} value={place.id}>{place.name}</option>
                    ))}
                  </select>
                </label>
                {desk.relations.every((relation) => relation.status !== "rival") ? <p className="text-sm text-muted">Declare a rivalry before proposing a contest.</p> : null}
                <button disabled={pending || desk.relations.every((relation) => relation.status !== "rival") || places.length === 0} className="btn btn-secondary">
                  Propose contest
                </button>
              </form>
            ) : null}
            <Link href="/map" className="text-sm text-gold">
              Open the world map
            </Link>
          </section>
          {!desk.member ? (
            <form action={action}>
              <input type="hidden" name="intent" value="apply" />
              <input type="hidden" name="organizationId" value={org.id} />
              <button disabled={pending || org.recruitment === "closed"} className="btn btn-primary">
                {org.recruitment === "closed" ? "Recruitment is closed" : "Apply or join"}
              </button>
            </form>
          ) : null}
        </div>
      ) : null}

      {tab === "Members" ? (
        <section className="space-y-3">
          <label className="block text-sm">
            Find a member
            <input value={memberQuery} onChange={(event) => setMemberQuery(event.target.value)} className="field" placeholder="Username" />
          </label>
          {desk.members.length === 0 ? <p className="text-sm text-muted">Membership is hidden until you belong to this organization.</p> : null}
          {desk.members.length > 0 && members.length === 0 ? <p className="text-sm text-muted">No member matches that name.</p> : null}
          <ul className="space-y-2">
            {members.map((member) => (
              <li key={member.username} className="panel text-sm">
                <p>
                  {member.username} · {member.rankName}
                  {member.founder ? " · founder" : ""}
                </p>
                <p className="text-muted">Joined {formatUtc(member.joinedAt)}</p>
              </li>
            ))}
          </ul>
          {desk.applications.length > 0 && !desk.member?.approve ? <p className="text-sm text-muted">Applications are waiting. Your rank cannot approve them.</p> : null}
          {desk.member?.approve
            ? desk.applications.map((application) => (
                <form key={application.id} action={action} className="panel flex flex-wrap items-center gap-2 text-sm">
                  <input type="hidden" name="intent" value="review-application" />
                  <input type="hidden" name="applicationId" value={application.id} />
                  <span>{application.username} applied.</span>
                  <button name="approve" value="yes" disabled={pending} className="btn btn-primary">
                    Approve
                  </button>
                  <button name="approve" value="no" disabled={pending} className="btn btn-secondary">
                    Reject
                  </button>
                </form>
              ))
            : null}
          {desk.member?.invite ? (
            <form action={action} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="intent" value="invite" />
              <input type="hidden" name="organizationId" value={org.id} />
              <label className="text-sm">
                Invite username
                <input name="username" className="field" />
              </label>
              <button disabled={pending} className="btn btn-secondary">
                Invite
              </button>
            </form>
          ) : null}
          {desk.member?.promote ? (
            <form action={action} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="intent" value="rank" />
              <input type="hidden" name="organizationId" value={org.id} />
              <label className="text-sm">
                Member
                <input name="username" className="field" />
              </label>
              <label className="text-sm">
                Rank
                <select name="rankKey" className="field">
                  {RANK_KEYS.filter((rank) => rank !== "founder").map((rank) => (
                    <option key={rank} value={rank}>
                      {rank}
                    </option>
                  ))}
                </select>
              </label>
              <button disabled={pending} className="btn btn-secondary">
                Set rank
              </button>
            </form>
          ) : null}
          {desk.member?.remove ? (
            <form action={action} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="intent" value="remove" />
              <input type="hidden" name="organizationId" value={org.id} />
              <label className="text-sm">
                Remove member
                <input name="username" className="field" />
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="confirmRemove" value="yes" required />
                Confirm removal
              </label>
              <button disabled={pending} className="btn btn-danger">
                Remove
              </button>
            </form>
          ) : null}
        </section>
      ) : null}

      {tab === "Treasury" ? (
        <section className="space-y-3">
          <p className="text-sm text-muted">The balance is the stored treasury. The lines below are individual ledger rows, not a second total.</p>
          <Stat label="Current balance" value={org.balance.toLocaleString("en-US")} />
          {desk.ledger.length === 0 ? (
            <p className="text-sm text-muted">{desk.member?.reports ? "No treasury movement is recorded." : "Ledger lines are visible to members who can view reports."}</p>
          ) : null}
          <ul className="space-y-1 text-sm">
            {desk.ledger.map((entry, index) => (
              <li key={`${entry.reason}-${index}`}>
                {entry.direction === "in" ? "+" : "−"}
                {Number(entry.amount).toLocaleString("en-US")} · {entry.reason.replaceAll("_", " ")} · {formatUtc(entry.createdAt)}
              </li>
            ))}
          </ul>
          {desk.member ? (
            <form action={action} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="intent" value="deposit" />
              <input type="hidden" name="organizationId" value={org.id} />
              <input type="hidden" name="idempotencyKey" value={key} />
              <label className="text-sm">
                Contribute from your character
                <input name="amount" type="number" min={1} required className="field w-28" />
              </label>
              <button disabled={pending || !key} className="btn btn-primary">
                Contribute
              </button>
            </form>
          ) : null}
          {desk.member?.withdraw ? (
            <form action={action} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="intent" value="withdraw" />
              <input type="hidden" name="organizationId" value={org.id} />
              <input type="hidden" name="idempotencyKey" value={withdrawKey} />
              <label className="text-sm">
                Pay member
                <input name="username" required className="field" />
              </label>
              <label className="text-sm">
                Amount
                <input name="amount" type="number" min={1} required className="field w-28" />
              </label>
              <button disabled={pending || !withdrawKey} className="btn btn-secondary">
                Withdraw
              </button>
            </form>
          ) : null}
          <p className="text-sm text-muted">A withdrawal above the approval threshold waits for a second officer. The server decides that limit.</p>
        </section>
      ) : null}

      {tab === "Operations" ? (
        <section className="space-y-3">
          <p className="text-sm text-muted">
            A joint shift records two company shifts worked while the contract is open. A shift already recorded on a work bulletin cannot be recorded here. The treasury receives the stake and margin once, and each recorded member receives 1 reputation. The other contracts remain abstract game results. Launch spends the configured stake. Resolve is available after the stored completion time. A contested recovery can be opened only by an organization that is not marked lawful, and the server applies heat.
          </p>
          {desk.locations.length === 0 ? <p className="text-sm text-muted">No extra operational city is recorded. Headquarters remains {org.city}.</p> : null}
          {desk.locations.length > 0 ? <p className="text-sm">Operational cities: {desk.locations.map((place) => place.name).join(", ")}.</p> : null}
          {desk.operations.length === 0 ? <p className="text-sm text-muted">No contract is recorded for members.</p> : null}
          {desk.operations.map((operation) => {
            const definition = OPERATIONS[operation.definitionKey as keyof typeof OPERATIONS];
            const open = operation.status === "preparation" || operation.status === "recruiting";
            return (
              <article key={operation.id} className="panel space-y-2 text-sm">
                <h3 className="font-serif text-xl">{definition?.label ?? operation.definitionKey}</h3>
                <p>
                  {operation.status}
                  {definition ? ` · ${definition.risk} risk` : ""}
                  {definition?.criminal ? " · fictional criminal contract" : " · lawful contract"}
                </p>
                <p className="text-muted">{definition?.summary}</p>
                {operation.definitionKey === "joint" ? <p>Recorded shifts <span className="num">{operation.recorded}</span> of 2.</p> : null}
                {operation.completesAt && operation.status === "in_progress" ? <p className="text-muted">Completes {formatUtc(operation.completesAt)}</p> : null}
                {operation.summary ? <p>{operation.summary}</p> : null}
                <div className="flex flex-wrap gap-2">
                  {open && !operation.joined ? (
                    <form action={action}>
                      <input type="hidden" name="intent" value="operation-join" />
                      <input type="hidden" name="operationId" value={operation.id} />
                      <button disabled={pending} className="btn btn-secondary">
                        Join
                      </button>
                    </form>
                  ) : null}
                  {open && operation.joined && !operation.openedBy ? (
                    <form action={action}>
                      <input type="hidden" name="intent" value="operation-leave" />
                      <input type="hidden" name="operationId" value={operation.id} />
                      <button disabled={pending} className="btn btn-secondary">
                        Leave
                      </button>
                    </form>
                  ) : null}
                  {operation.definitionKey === "joint" && operation.status === "in_progress" && operation.joined && !operation.credited ? (
                    <form action={action}>
                      <input type="hidden" name="intent" value="operation-record" />
                      <input type="hidden" name="operationId" value={operation.id} />
                      <button disabled={pending} className="btn btn-primary">
                        Record a company shift
                      </button>
                    </form>
                  ) : null}
                  {open && operation.openedBy ? (
                    <form action={action}>
                      <input type="hidden" name="intent" value="operation-launch" />
                      <input type="hidden" name="operationId" value={operation.id} />
                      <button disabled={pending} className="btn btn-primary">
                        Launch
                      </button>
                    </form>
                  ) : null}
                  {open && operation.openedBy ? (
                    <form action={action}>
                      <input type="hidden" name="intent" value="operation-cancel" />
                      <input type="hidden" name="operationId" value={operation.id} />
                      <button disabled={pending} className="btn btn-secondary">
                        Cancel
                      </button>
                    </form>
                  ) : null}
                  {operation.status === "in_progress" ? (
                    <form action={action}>
                      <input type="hidden" name="intent" value="operation-resolve" />
                      <input type="hidden" name="operationId" value={operation.id} />
                      <button disabled={pending} className="btn btn-primary">
                        Resolve
                      </button>
                    </form>
                  ) : null}
                </div>
              </article>
            );
          })}
          {desk.member?.startOperations ? (
            <form action={action} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="intent" value="operation-open" />
              <label className="text-sm">
                Contract
                <select name="definitionKey" className="field">
                  {Object.entries(OPERATIONS).map(([id, operation]) => (
                    <option key={id} value={id}>
                      {operation.label}
                      {operation.criminal ? " · criminal" : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                City
                <select name="placeId" className="field">
                  {places.map((place) => (
                    <option key={place.id} value={place.id}>
                      {place.name}
                    </option>
                  ))}
                </select>
              </label>
              <button disabled={pending} className="btn btn-primary">
                Prepare contract
              </button>
            </form>
          ) : null}
          {desk.member?.locations ? (
            <form action={action} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="intent" value="location" />
              <input type="hidden" name="organizationId" value={org.id} />
              <label className="text-sm">
                Operational city in the headquarters country
                <select name="placeId" className="field">
                  {places.map((place) => (
                    <option key={place.id} value={place.id}>
                      {place.name}
                    </option>
                  ))}
                </select>
              </label>
              <button disabled={pending} className="btn btn-secondary">
                Save location
              </button>
            </form>
          ) : null}
        </section>
      ) : null}

      {tab === "Underground" ? (
        <section className="space-y-4">
          <div className="panel space-y-2">
            <h2 className="section-title">Your record</h2>
            {status ? (
              <p className="text-sm">
                Heat {status.heat} · status {status.wanted} · fines {status.fines} · planning {status.planning} · concealment {status.concealment}. Status words come from the stored heat. Clear is below 10, low is 10 or more, investigated is 25 or more, and restricted is 40 or more.
              </p>
            ) : (
              <p className="text-sm text-muted">No underworld record yet. Lawful play does not require one.</p>
            )}
            <div className="flex flex-wrap gap-2">
              <form action={action}>
                <input type="hidden" name="intent" value="lay-low" />
                <button disabled={pending} className="btn btn-secondary">
                  Lay low
                </button>
              </form>
              <form action={action}>
                <input type="hidden" name="intent" value="review-case" />
                <button disabled={pending} className="btn btn-secondary">
                  Review investigation
                </button>
              </form>
              {status && status.fines > 0 ? (
                <form action={action}>
                  <input type="hidden" name="intent" value="pay-fine" />
                  <input type="hidden" name="idempotencyKey" value={fineKey} />
                  <button disabled={pending || !fineKey} className="btn btn-primary">
                    Pay fine of {status.fines}
                  </button>
                </form>
              ) : null}
            </div>
          </div>
          <div className="space-y-2">
            <h2 className="section-title">Underground listings</h2>
            <p className="text-sm text-muted">Seller names are hidden. A listing uses the same currency and inventory as the rest of the game.</p>
            {listings.length === 0 ? <p className="text-sm text-muted">No listing is open.</p> : null}
            {listings.map((listing) => (
              <form key={listing.id} action={action} className="panel flex flex-wrap items-center justify-between gap-2 text-sm">
                <input type="hidden" name="intent" value="buy-market" />
                <input type="hidden" name="listingId" value={listing.id} />
                <span>
                  Masked seller · {listing.product} · {listing.quantity} · {listing.unitPrice} · {listing.city} {listing.iso2}
                </span>
                <button disabled={pending} className="btn btn-secondary">
                  Buy
                </button>
              </form>
            ))}
            {desk.member?.market ? (
              <form action={action} className="flex flex-wrap items-end gap-2">
                <input type="hidden" name="intent" value="list-market" />
                <input type="hidden" name="idempotencyKey" value={listKey} />
                <label className="text-sm">
                  City
                  <select name="placeId" className="field">
                    {places.map((place) => (
                      <option key={place.id} value={place.id}>
                        {place.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm">
                  Good
                  <select name="productId" className="field">
                    {products.map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm">
                  Quantity
                  <input name="quantity" type="number" min={1} max={20} required className="field w-24" />
                </label>
                <label className="text-sm">
                  Unit price
                  <input name="unitPrice" type="number" min={1} max={500} required className="field w-24" />
                </label>
                <button disabled={pending || !listKey} className="btn btn-secondary">
                  List
                </button>
              </form>
            ) : null}
          </div>
          <div className="space-y-2">
            <h2 className="section-title">Deliveries</h2>
            <p className="text-sm text-muted">A delivery is a game contract between starting cities. Travel time uses distance, not a live route.</p>
            {deliveries.length === 0 ? <p className="text-sm text-muted">No delivery is available to you.</p> : null}
            {deliveries.map((delivery) => (
              <div key={delivery.id} className="panel flex flex-wrap items-center justify-between gap-2 text-sm">
                <span>
                  {delivery.product} · {delivery.quantity} · pay {delivery.payment} · {delivery.origin} to {delivery.destination} · {delivery.status}
                </span>
                {delivery.status === "available" && !delivery.poster ? (
                  <form action={action}>
                    <input type="hidden" name="intent" value="delivery-accept" />
                    <input type="hidden" name="contractId" value={delivery.id} />
                    <button disabled={pending} className="btn btn-secondary">
                      Accept
                    </button>
                  </form>
                ) : null}
                {delivery.status === "accepted" && delivery.carrier ? (
                  <form action={action}>
                    <input type="hidden" name="intent" value="delivery-depart" />
                    <input type="hidden" name="contractId" value={delivery.id} />
                    <button disabled={pending} className="btn btn-primary">
                      Depart
                    </button>
                  </form>
                ) : null}
                {delivery.status === "in_transit" && delivery.carrier ? (
                  <form action={action}>
                    <input type="hidden" name="intent" value="delivery-resolve" />
                    <input type="hidden" name="contractId" value={delivery.id} />
                    <button disabled={pending} className="btn btn-primary">
                      Resolve
                    </button>
                  </form>
                ) : null}
              </div>
            ))}
            <form action={action} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="intent" value="delivery-create" />
              <input type="hidden" name="idempotencyKey" value={deliveryKey} />
              <label className="text-sm">
                From
                <select name="originPlaceId" className="field">
                  {places.map((place) => (
                    <option key={place.id} value={place.id}>
                      {place.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                To
                <select name="destinationPlaceId" className="field">
                  {places.map((place) => (
                    <option key={place.id} value={place.id}>
                      {place.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                Good
                <select name="productId" className="field">
                  {products.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                Quantity
                <input name="quantity" type="number" min={1} max={20} required className="field w-24" />
              </label>
              <label className="text-sm">
                Pay
                <input name="payment" type="number" min={1} max={200} required className="field w-24" />
              </label>
              <button disabled={pending || !deliveryKey} className="btn btn-secondary">
                Post contract
              </button>
            </form>
          </div>
        </section>
      ) : null}

      {tab === "Diplomacy" ? (
        <section className="space-y-3">
          <p className="text-sm text-muted">These are organization relationship records. A proposal is not in force until the other organization accepts it. None of them grants control of a country.</p>
          {desk.relations.length === 0 ? <p className="text-sm text-muted">No relationship is recorded.</p> : null}
          <ul className="space-y-2">
            {desk.relations.map((relation) => (
              <li key={relation.otherId} className="panel text-sm">
                <p>
                  {relation.other} · {relation.status}
                  {relation.proposal ? ` · proposal ${relation.proposal}` : ""}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {desk.member?.treaties && relation.proposal ? (
                    <form action={action}>
                      <input type="hidden" name="intent" value="accept-agreement" />
                      <input type="hidden" name="organizationId" value={org.id} />
                      <input type="hidden" name="otherOrganizationId" value={relation.otherId} />
                      <button disabled={pending} className="btn btn-primary">
                        Accept proposal
                      </button>
                    </form>
                  ) : null}
                  {desk.member?.treaties ? (
                    <form action={action} className="flex flex-wrap items-center gap-2">
                      <input type="hidden" name="intent" value="end-relation" />
                      <input type="hidden" name="organizationId" value={org.id} />
                      <input type="hidden" name="otherOrganizationId" value={relation.otherId} />
                      <label className="flex items-center gap-2">
                        <input type="checkbox" required />
                        Confirm ending this relationship
                      </label>
                      <button disabled={pending} className="btn btn-secondary">
                        End
                      </button>
                    </form>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
          {peers.length === 0 ? <p className="text-sm text-muted">No other public organization is available.</p> : null}
          {desk.member?.treaties && peers.length > 0 ? (
            <form action={action} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="intent" value="propose" />
              <input type="hidden" name="organizationId" value={org.id} />
              <label className="text-sm">
                Organization
                <select name="otherOrganizationId" className="field">
                  {peers.map((peer) => (
                    <option key={peer.id} value={peer.id}>
                      {peer.name} [{peer.tag}]
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                Proposal
                <select name="proposal" className="field">
                  <option value="cooperative">Cooperative</option>
                  <option value="partner">Business partner</option>
                  <option value="allied">Allied</option>
                  <option value="ceasefire">Ceasefire</option>
                </select>
              </label>
              <button disabled={pending} className="btn btn-primary">
                Propose
              </button>
            </form>
          ) : null}
          {desk.member?.rivalries && peers.length > 0 ? (
            <form action={action} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="intent" value="rivalry" />
              <input type="hidden" name="organizationId" value={org.id} />
              <label className="text-sm">
                Rival
                <select name="otherOrganizationId" className="field">
                  {peers.map((peer) => (
                    <option key={peer.id} value={peer.id}>
                      {peer.name} [{peer.tag}]
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" required />
                Confirm this records a rivalry, not control of a country
              </label>
              <button disabled={pending} className="btn btn-danger">
                Declare rivalry
              </button>
            </form>
          ) : null}
          {(desk.member?.rankKey === "founder" || desk.member?.rankKey === "leader") && org.typeLabel.endsWith("lawful") ? (
            <form action={action} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="intent" value="endorse" />
              <input type="hidden" name="organizationId" value={org.id} />
              <label className="text-sm">
                Endorse a character in the headquarters country
                <input name="username" className="field" />
              </label>
              <button disabled={pending} className="btn btn-secondary">
                Record endorsement
              </button>
            </form>
          ) : null}
          <p className="text-sm text-muted">An endorsement is a public organization event. It does not add votes.</p>
        </section>
      ) : null}

      {tab === "Record" ? (
        <section className="space-y-2">
          <h2 className="section-title">Activity</h2>
          {desk.events.length === 0 ? <p className="text-sm text-muted">No activity is visible to you.</p> : null}
          <ul className="space-y-2 text-sm">
            {desk.events.map((event, index) => (
              <li key={`${event.kind}-${index}`} className="panel">
                <p>{event.detail}</p>
                <p className="text-muted">
                  {event.kind} · {formatUtc(event.createdAt)}
                </p>
              </li>
            ))}
          </ul>
          <h2 className="section-title">City influence</h2>
          {desk.influence.length === 0 ? <p className="text-sm text-muted">No city influence is recorded.</p> : null}
          <ul className="text-sm">
            {desk.influence.map((row) => (
              <li key={row.city}>
                {row.city} · score {row.score}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {tab === "Settings" && desk.member ? (
        <section className="space-y-3">
          {desk.member.settings ? (
            <>
              <form action={action} className="flex flex-wrap items-end gap-2">
                <input type="hidden" name="intent" value="permission" />
                <input type="hidden" name="organizationId" value={org.id} />
                <label className="text-sm">
                  Rank
                  <select name="rankKey" className="field">
                    {RANK_KEYS.filter((rank) => rank !== "founder").map((rank) => (
                      <option key={rank} value={rank}>
                        {rank}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm">
                  Permission
                  <select name="permission" className="field">
                    {PERMISSIONS.filter((permission) => permission !== "dissolve").map((permission) => (
                      <option key={permission} value={permission}>
                        {PERMISSION_LABELS[permission] ?? permission}
                      </option>
                    ))}
                  </select>
                </label>
                <button name="enabled" value="yes" disabled={pending} className="btn btn-primary">
                  Allow
                </button>
                <button name="enabled" value="no" disabled={pending} className="btn btn-secondary">
                  Remove
                </button>
              </form>
              <form action={action} className="flex flex-wrap items-end gap-2">
                <input type="hidden" name="intent" value="rename-rank" />
                <input type="hidden" name="organizationId" value={org.id} />
                <label className="text-sm">
                  Rank
                  <select name="rankKey" className="field">
                    {RANK_KEYS.filter((rank) => rank !== "founder").map((rank) => (
                      <option key={rank} value={rank}>
                        {rank}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm">
                  Display name
                  <input name="name" minLength={3} maxLength={24} required className="field" />
                </label>
                <button disabled={pending} className="btn btn-secondary">
                  Rename rank
                </button>
              </form>
            </>
          ) : (
            <p className="text-sm text-muted">Your rank cannot change permissions.</p>
          )}
          {desk.member.rankKey === "founder" || desk.member.rankKey === "leader" ? (
            <form action={action} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="intent" value="transfer" />
              <input type="hidden" name="organizationId" value={org.id} />
              <input type="hidden" name="idempotencyKey" value={leadKey} />
              <label className="text-sm">
                New leader
                <input name="username" required className="field" />
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" required />
                Confirm leadership transfer
              </label>
              <button disabled={pending || !leadKey} className="btn btn-danger">
                Transfer leadership
              </button>
            </form>
          ) : null}
          {desk.member.dissolve ? (
            <form action={action} className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="intent" value="dissolve" />
              <input type="hidden" name="organizationId" value={org.id} />
              <input type="hidden" name="idempotencyKey" value={dissolveKey} />
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="confirm" value="yes" required />
                Confirm dissolution
              </label>
              <button disabled={pending || !dissolveKey} className="btn btn-danger">
                Dissolve
              </button>
            </form>
          ) : null}
          <form action={action} className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="intent" value="leave" />
            <input type="hidden" name="organizationId" value={org.id} />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" required />
              Confirm leaving
            </label>
            <button disabled={pending} className="btn btn-secondary">
              Leave
            </button>
          </form>
        </section>
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="panel">
      <p className="kicker">{label}</p>
      <p className="num mt-1 text-xl">{value}</p>
    </div>
  );
}
