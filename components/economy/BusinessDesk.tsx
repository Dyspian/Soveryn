"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { EntityMark } from "@/components/game/EntityMark";
import { businessAction } from "@/lib/actions/economy";
import { ActionFeedback } from "@/components/feedback/ActionFeedback";
import type { ActionResult } from "@/lib/actions/account";
import { formatCount } from "@/lib/game/format";
import { formatUtc } from "@/lib/world/clock";

const EXTRACTION_CATEGORIES = new Set(["mining", "energy", "agriculture"]);

const LEDGER_LABELS: Record<string, string> = {
  service_shift: "service fee",
  wage: "wage",
  deposit: "deposit",
  withdraw: "withdrawal",
  production_cost: "production cost",
  production_refund: "production refund",
  extraction_cost: "extraction cost",
  market_sale: "market sale",
  market_fee: "market fee",
  shipment_cost: "shipment cost",
};

type Desk = {
  id: string;
  name: string;
  description: string;
  category: string;
  balance: number;
  currency: number;
  city: string;
  country: string;
  countryIso2: string;
  placeId: string;
  owner: boolean;
  stock: { productId: string; name: string; quantity: number; unit: string }[];
  jobs: { id: string; name: string; status: string; ready: boolean }[];
  sites: { id: string; resourceId: string; resource: string; remaining: number; status: string; cooling: boolean }[];
  ledger: { reason: string; amount: number; direction: string; created_at: string }[];
  employees: { id: string; username: string; wage: number }[];
  shipments: { id: string; status: string; product: string; quantity: number; destination: string; ready: boolean }[];
  recipes: {
    id: string;
    name: string;
    description: string;
    operatingCost: number;
    chargedCost: number;
    durationSeconds: number;
    inputs: string;
    outputName: string;
    outputQuantity: number;
    inputLines: { productId: string; name: string; quantity: number; held: number }[];
  }[];
  shiftSkill: string | null;
  guidance: string;
  shiftCooling: boolean;
  shifts: { id: string; username: string; kind: string; gross: number; wagePaid: number; detail: string; createdAt: string }[];
  revenue: number;
  expenses: number;
  products: { id: string; name: string }[];
  resources: { id: string; name: string }[];
  cities: { id: string; name: string; country: string }[];
};

export function BusinessDesk({ desk }: { desk: Desk }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(businessAction, null);
  const [depositKey] = useState(() => crypto.randomUUID());
  const [withdrawKey] = useState(() => crypto.randomUUID());
  const [shipKey] = useState(() => crypto.randomUUID());
  const [listKey] = useState(() => crypto.randomUUID());
  return (
    <div className="space-y-6">
      <header className="panel flex items-start gap-3">
        <EntityMark kind="business" id={desk.category} label={desk.category} />
        <div className="min-w-0">
          <p className="kicker">{desk.category}</p>
          <h1 className="page-title">{desk.name}</h1>
          <p className="mt-2 text-muted">{desk.description || "No description."}</p>
          <p className="mt-2 flex items-center gap-2 text-sm">
            <EntityMark kind="country" code={desk.countryIso2} label={desk.country} size="sm" />
            <span>
              {desk.city}, {desk.country}
              {desk.owner ? " · you own this company" : " · you work here"}
            </span>
          </p>
        </div>
      </header>
      <ActionFeedback state={state} />
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Business balance" value={desk.balance} />
        <Stat label="Recent inflow" value={desk.revenue} />
        <Stat label="Recent outflow" value={desk.expenses} />
      </div>
      <p className="text-xs text-muted">Inflow and outflow cover the latest ledger rows, not a fabricated history. Your character holds {desk.currency.toLocaleString("en-US")}.</p>
      <section className="panel space-y-3">
        <h2 className="section-title">How this company earns</h2>
        <p className="text-sm text-muted">{desk.guidance}</p>
        <p className="text-sm text-muted">
          You can work a shift here if you own the company or the owner has hired you. Another player works from the Jobs page after they are hired. Each person can work one shift at a time, then waits out the cooldown.
        </p>
        {desk.shiftSkill ? (
          <p className="text-sm text-muted">
            This service fee rises by the worker&apos;s {desk.shiftSkill.replaceAll("_", " ")} level, up to the configured cap. The extra amount is credited to the company.
          </p>
        ) : null}
        <form action={action}>
          <input type="hidden" name="businessId" value={desk.id} />
          <input type="hidden" name="intent" value="shift" />
          <button disabled={pending || desk.shiftCooling} className="btn btn-primary">
            {pending ? "Working…" : desk.shiftCooling ? "Shift on cooldown" : "Work a shift"}
          </button>
        </form>
        {desk.shifts.length === 0 ? <p className="text-sm text-muted">No shift has been worked yet.</p> : null}
        <ul className="space-y-2 text-sm">
          {desk.shifts.map((shift) => (
            <li key={shift.id}>
              <span className="text-ink">{shift.username}</span>
              <span className="text-muted">
                {" "}
                · {shift.detail}
                {shift.gross > 0 ? ` · fee ${shift.gross.toLocaleString("en-US")}` : ""}
                {shift.wagePaid > 0 ? ` · wage paid ${shift.wagePaid.toLocaleString("en-US")}` : ""}
                {" · "}
                {formatUtc(shift.createdAt)}
              </span>
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h2 className="section-title">Stock in {desk.city}</h2>
        {desk.stock.length === 0 ? <p className="mt-2 text-sm text-muted">No goods are stored in this city.</p> : null}
        <ul className="mt-2 space-y-2 text-sm">
          {desk.stock.map((item) => (
            <li key={item.productId} className="flex items-center gap-2">
              <EntityMark kind="resource" id={item.productId} label={item.name} size="sm" />
              <span>
                {item.name} · <span className="num">{formatCount(item.quantity)}</span> {item.unit}
              </span>
            </li>
          ))}
        </ul>
      </section>
      {desk.owner ? (
        <>
          <div className="flex flex-wrap gap-4">
            <form action={action} className="flex items-end gap-2">
              <input type="hidden" name="businessId" value={desk.id} />
              <input type="hidden" name="idempotencyKey" value={depositKey} />
              <input type="hidden" name="intent" value="deposit" />
              <label className="text-sm">
                Deposit
                <input name="amount" type="number" min={1} required className="field-inline mt-1 w-28" />
              </label>
              <button disabled={pending} className="btn btn-secondary">
                Deposit
              </button>
            </form>
            <form action={action} className="flex items-end gap-2">
              <input type="hidden" name="businessId" value={desk.id} />
              <input type="hidden" name="idempotencyKey" value={withdrawKey} />
              <input type="hidden" name="intent" value="withdraw" />
              <label className="text-sm">
                Withdraw
                <input name="amount" type="number" min={1} required className="field-inline mt-1 w-28" />
              </label>
              <button disabled={pending} className="btn btn-secondary">
                Withdraw
              </button>
            </form>
          </div>
          <section className="space-y-2">
            <h2 className="section-title">Production</h2>
            {desk.recipes.length === 0 ? <p className="text-sm text-muted">No recipe is configured for this category. Earnings come from a work shift.</p> : null}
            {desk.recipes.map((recipe) => (
              <form key={recipe.id} action={action} className="panel text-sm">
                <input type="hidden" name="businessId" value={desk.id} />
                <input type="hidden" name="recipeId" value={recipe.id} />
                <input type="hidden" name="intent" value="produce" />
                <h3 className="font-serif text-xl">{recipe.name}</h3>
                <p className="text-muted">{recipe.description}</p>
                <p className="mt-1 text-xs text-muted">
                  Yields {recipe.outputName} × <span className="num">{recipe.outputQuantity}</span>.
                </p>
                {recipe.inputLines.length === 0 ? <p className="mt-1 text-xs text-muted">No inputs.</p> : (
                  <ul className="mt-1 text-xs text-muted">
                    {recipe.inputLines.map((line) => (
                      <li key={line.productId} className="flex items-center gap-2">
                        <EntityMark kind="resource" id={line.productId} label={line.name} size="sm" />
                        <span>
                          {line.name} × <span className="num">{line.quantity}</span>
                          {" · held "}
                          <span className="num">{line.held}</span>
                          {line.held < line.quantity ? ` · short by ${line.quantity - line.held}` : " · enough held"}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="mt-1 text-xs text-muted">
                  Operating cost <span className="num">{recipe.chargedCost}</span>
                  {recipe.chargedCost < recipe.operatingCost ? ` (catalog ${recipe.operatingCost}, lowered by Production)` : ""}. Duration {recipe.durationSeconds} seconds. Output arrives in company stock.
                </p>
                <button disabled={pending} className="btn btn-primary mt-2">
                  Start
                </button>
              </form>
            ))}
            {desk.recipes.length > 0 && desk.jobs.length === 0 ? <p className="text-sm text-muted">Nothing is in production.</p> : null}
            {desk.jobs.map((job) => (
              <div key={job.id} className="text-sm">
                <span>
                  {job.name} · {job.ready ? "ready" : "running"}
                </span>
                <form action={action} className="inline">
                  <input type="hidden" name="businessId" value={desk.id} />
                  <input type="hidden" name="jobId" value={job.id} />
                  <button name="intent" value="complete" disabled={pending || !job.ready} className="btn btn-secondary ml-2">
                    Collect output
                  </button>
                </form>
                <form action={action} className="inline">
                  <input type="hidden" name="businessId" value={desk.id} />
                  <input type="hidden" name="jobId" value={job.id} />
                  <button name="intent" value="cancel-production" disabled={pending} className="btn btn-secondary ml-2">
                    Cancel
                  </button>
                </form>
              </div>
            ))}
          </section>
          <section className="space-y-2">
            <h2 className="section-title">Extraction</h2>
            {EXTRACTION_CATEGORIES.has(desk.category) ? (
              <>
            <p className="text-sm text-muted">
              A site opens only when this country has a positive sourced proved reserve. The site quantity is simulated game capacity and does not change the reference record.
            </p>
            <form action={action} className="flex flex-wrap gap-2">
              <input type="hidden" name="businessId" value={desk.id} />
              <input type="hidden" name="intent" value="extract-open" />
              <select name="resourceTypeId" aria-label="Resource" className="field">
                {desk.resources.map((resource) => (
                  <option key={resource.id} value={resource.id}>
                    {resource.name}
                  </option>
                ))}
              </select>
              <button disabled={pending} className="btn btn-secondary">
                Open site
              </button>
            </form>
            {desk.sites.length === 0 ? <p className="text-sm text-muted">No extraction site is open.</p> : null}
            {desk.sites.map((site) => (
              <form key={site.id} action={action} className="text-sm">
                <input type="hidden" name="businessId" value={desk.id} />
                <input type="hidden" name="siteId" value={site.id} />
                <input type="hidden" name="intent" value="extract" />
                <span className="inline-flex items-center gap-2">
                  <EntityMark kind="resource" id={site.resourceId} label={site.resource} size="sm" />
                  <span>
                    {site.resource} · simulated remaining {site.remaining} · {site.status}
                    {site.cooling ? " · cooling down" : ""}
                  </span>
                </span>
                <button disabled={pending || site.cooling || site.status !== "active"} className="btn btn-secondary ml-2">
                  Extract
                </button>
              </form>
            ))}
              </>
            ) : (
              <p className="text-sm text-muted">This category does not extract. Mining, energy, and agriculture are the only companies that can open a site.</p>
            )}
          </section>
          <section className="space-y-2">
            <h2 className="section-title">Employees</h2>
            <p className="text-sm text-muted">
              A hired player works a shift from the Jobs page. That shift creates the company&apos;s result and pays their wage once for the UTC day when the balance can cover it. Pay today&apos;s wages sends the same wage without waiting for a shift, and it cannot pay twice.
            </p>
            {desk.employees.length === 0 ? <p className="text-sm text-muted">Nobody is employed. Post a job, then hire the applicant on the Jobs page.</p> : null}
            {desk.employees.map((employee) => (
              <form key={employee.id} action={action} className="flex items-center justify-between text-sm">
                <input type="hidden" name="businessId" value={desk.id} />
                <input type="hidden" name="employmentId" value={employee.id} />
                <span>
                  {employee.username} · wage {employee.wage}
                </span>
                <button name="intent" value="dismiss" disabled={pending} className="btn btn-secondary">
                  Dismiss
                </button>
              </form>
            ))}
            <form action={action}>
              <input type="hidden" name="businessId" value={desk.id} />
              <input type="hidden" name="intent" value="payroll" />
              <button disabled={pending} className="btn btn-primary">
                Pay today&apos;s wages
              </button>
            </form>
            <form action={action} className="grid gap-2 sm:grid-cols-2">
              <input type="hidden" name="businessId" value={desk.id} />
              <input type="hidden" name="intent" value="post-job" />
              <label className="text-sm">
                Job title
                <input name="title" required className="field" />
              </label>
              <label className="text-sm">
                Wage
                <input name="wage" type="number" min={1} max={50} required className="field" />
              </label>
              <button disabled={pending} className="btn btn-secondary">
                Post job
              </button>
            </form>
          </section>
          <section className="space-y-2">
            <h2 className="section-title">Shipment</h2>
            <p className="text-sm text-muted">Travel time is a simulated great-circle estimate, not a measured route.</p>
            <form action={action} className="grid gap-2 sm:grid-cols-2">
              <input type="hidden" name="businessId" value={desk.id} />
              <input type="hidden" name="originPlaceId" value={desk.placeId} />
              <input type="hidden" name="intent" value="ship" />
              <input type="hidden" name="idempotencyKey" value={shipKey} />
              <select name="productId" aria-label="Product" className="field">
                {desk.products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name}
                  </option>
                ))}
              </select>
              <label className="text-sm">
                Quantity
                <input name="quantity" type="number" min={1} required className="field" />
              </label>
              <select name="destinationPlaceId" required aria-label="Destination city" className="field sm:col-span-2">
                {desk.cities
                  .filter((city) => city.id !== desk.placeId)
                  .map((city) => (
                    <option key={city.id} value={city.id}>
                      {city.name}, {city.country}
                    </option>
                  ))}
              </select>
              <button disabled={pending} className="btn btn-secondary">
                Dispatch
              </button>
            </form>
            {desk.shipments.map((shipment) => (
              <form key={shipment.id} action={action} className="text-sm">
                <input type="hidden" name="businessId" value={desk.id} />
                <input type="hidden" name="shipmentId" value={shipment.id} />
                <input type="hidden" name="intent" value="deliver" />
                <span>
                  {shipment.quantity} {shipment.product} to {shipment.destination} · {shipment.status}
                </span>
                <button disabled={pending || !shipment.ready || shipment.status === "delivered"} className="btn btn-secondary ml-2">
                  Deliver
                </button>
              </form>
            ))}
          </section>
          <section className="panel space-y-2">
            <h2 className="section-title">List stored goods</h2>
            <p className="text-sm text-muted">
              A listing removes the quantity from company stock in {desk.city}. Buyers pay the unit price you set. The market fee is taken when a sale completes.
            </p>
            <p className="text-sm">
              <Link className="text-gold" href={`/market?iso2=${desk.countryIso2}&place=${desk.placeId}`}>
                Open this city&apos;s market
              </Link>
            </p>
            {desk.stock.length === 0 ? <p className="text-sm text-muted">Nothing is stored here to list.</p> : (
              <form action={action} className="grid gap-2 sm:grid-cols-2">
                <input type="hidden" name="intent" value="list" />
                <input type="hidden" name="businessId" value={desk.id} />
                <input type="hidden" name="placeId" value={desk.placeId} />
                <input type="hidden" name="idempotencyKey" value={listKey} />
                <label className="text-sm">
                  Product
                  <select name="productId" className="field">
                    {desk.stock.map((item) => (
                      <option key={item.productId} value={item.productId}>
                        {item.name} ({item.quantity} {item.unit})
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm">
                  Quantity
                  <input name="quantity" type="number" min={1} max={100} defaultValue={1} className="field" />
                </label>
                <label className="text-sm">
                  Unit price
                  <input name="unitPrice" type="number" min={1} max={500} defaultValue={1} className="field" />
                </label>
                <button disabled={pending} className="btn btn-secondary self-end">
                  {pending ? "Listing…" : "List company stock"}
                </button>
              </form>
            )}
          </section>
        </>
      ) : (
        <p className="text-sm text-muted">You work here. Use the shift above to produce this company&apos;s result. Only the owner can move funds, post jobs, or change operations.</p>
      )}
      <section>
        <h2 className="section-title">Ledger</h2>
        {desk.ledger.length === 0 ? <p className="mt-2 text-sm text-muted">No payments have been recorded.</p> : null}
        <ul className="mt-2 space-y-2 text-sm">
          {desk.ledger.map((entry, index) => (
            <li key={`${entry.created_at}-${index}`} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <span>{LEDGER_LABELS[entry.reason] ?? entry.reason.replaceAll("_", " ")}</span>
              <span className="num">
                {entry.direction === "in" ? "received +" : "paid −"}
                {formatCount(entry.amount)}
              </span>
              <span className="text-xs text-muted">{formatUtc(entry.created_at)}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="panel">
      <p className="kicker">{label}</p>
      <p className="num mt-1 text-xl">{value.toLocaleString("en-US")}</p>
    </div>
  );
}
