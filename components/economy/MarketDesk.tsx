"use client";

import { useMemo, useState } from "react";
import { useActionState } from "react";
import { EntityMark } from "@/components/game/EntityMark";
import { marketAction } from "@/lib/actions/economy";
import { filterListings, purchaseQuote, type MarketSort } from "@/lib/economy/quote";
import type { ActionResult } from "@/lib/actions/account";

type Listing = { id: string; productId: string; product: string; category: string; quantity: number; unitPrice: number; seller: string };
type Sale = { productId: string; name: string; unitPrice: number };
type Supply = { productId: string; name: string; quantity: number };
type Holding = { productId: string; name: string; quantity: number };
type OwnListing = { id: string; productId: string; product: string; quantity: number; unitPrice: number; seller: string };

function amount(value: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

export function MarketDesk({
  listings,
  products,
  holderId,
  placeId,
  currency,
  feePercent,
  feeDiscountPercent,
  salesTax,
  sales,
  supply,
  stock,
  ownListings,
}: {
  listings: Listing[];
  products: { id: string; name: string; category: string }[];
  holderId: string;
  placeId: string;
  currency: number;
  feePercent: number;
  feeDiscountPercent: number;
  salesTax: number;
  sales: Sale[];
  supply: Supply[];
  stock: Holding[];
  ownListings: OwnListing[];
}) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(marketAction, null);
  const [key] = useState(() => crypto.randomUUID());
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [sort, setSort] = useState<MarketSort>("name");
  const [selectedId, setSelectedId] = useState<string | null>(listings[0]?.id ?? null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const categories = useMemo(() => [...new Set(listings.map((listing) => listing.category))].sort(), [listings]);
  const visible = useMemo(() => filterListings(listings, query, category, sort), [listings, query, category, sort]);
  const selected = listings.find((listing) => listing.id === selectedId) ?? null;
  const selectedVisible = selected ? visible.some((listing) => listing.id === selected.id) : false;

  return (
    <div className="space-y-4">
      <p className="text-sm">
        <span className="inline-flex items-center gap-2">
          <EntityMark kind="currency" label="Currency" size="sm" />
          Your currency <span className="num text-gold">{amount(currency)}</span>
        </span>
        <span className="text-muted">
          {" "}
          · configured market fee {feePercent}%
          {feeDiscountPercent > 0 ? ` · your stored fee discount ${feeDiscountPercent}%` : " · no stored fee discount"}
          {" · "}
          this city&apos;s sales tax {salesTax}%
        </span>
      </p>
      <p className="text-sm text-muted">
        The goods price is quantity times the seller&apos;s unit price. The quote below uses the same rounding as a purchase, including your current fee discount. The server calculates the fee and sales tax again when the purchase is saved.
      </p>
      {state?.ok ? <p className="text-sm text-gold" role="status">{state.message}</p> : null}
      {state && !state.ok ? <p className="text-sm text-danger" role="alert">{state.error}</p> : null}
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-end">
        <label className="min-w-0 text-sm">
          Search goods
          <input className="field" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Good name" type="search" />
        </label>
        <label className="text-sm">
          Category
          <select className="field" value={category} onChange={(event) => setCategory(event.target.value)}>
            <option value="all">All</option>
            {categories.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Sort
          <select className="field" value={sort} onChange={(event) => setSort(event.target.value as "name" | "price" | "quantity")}>
            <option value="name">Name</option>
            <option value="price">Unit price</option>
            <option value="quantity">Quantity</option>
          </select>
        </label>
      </div>
      <section className="panel text-sm">
        <h2 className="section-title">Recorded trade</h2>
        <p className="mt-1 text-muted">Last completed sale prices are taken from sold listings in this city. Open quantity is only what is listed now.</p>
        {sales.length === 0 ? <p className="mt-2 text-muted">No completed sale is recorded in this city.</p> : null}
        <ul className="mt-2 space-y-1">
          {sales.map((sale) => {
            const listed = supply.find((row) => row.productId === sale.productId);
            return (
              <li key={sale.productId} className="flex items-center gap-2">
                <EntityMark kind="resource" id={sale.productId} label={sale.name} size="sm" />
                <span>{sale.name} · last sale <span className="num">{amount(sale.unitPrice)}</span> each
                {listed ? ` · ${amount(listed.quantity)} listed now` : " · nothing listed now"}
                </span>
              </li>
            );
          })}
        </ul>
        {supply
          .filter((row) => !sales.some((sale) => sale.productId === row.productId))
          .map((row) => (
            <p key={row.productId} className="mt-1 flex items-center gap-2">
              <EntityMark kind="resource" id={row.productId} label={row.name} size="sm" />
              <span>{row.name} · <span className="num">{amount(row.quantity)}</span> listed now · no completed sale is recorded</span>
            </p>
          ))}
      </section>
      <section className="text-sm">
        <h2 className="section-title">Your stock here</h2>
        {stock.length === 0 ? <p className="mt-1 text-muted">You are not holding goods in this city. Company stock is listed from the business page.</p> : null}
        <ul className="mt-1">
          {stock.map((item) => (
            <li key={item.productId} className="flex items-center gap-2">
              <EntityMark kind="resource" id={item.productId} label={item.name} size="sm" />
              <span>{item.name} · <span className="num">{amount(item.quantity)}</span></span>
            </li>
          ))}
        </ul>
      </section>
      {ownListings.length > 0 ? (
        <section className="space-y-2">
          <h2 className="section-title">Your open listings</h2>
          <ul className="space-y-2">
            {ownListings.map((listing) => (
              <li key={listing.id} className="panel flex flex-wrap items-center justify-between gap-3 text-sm">
                <span className="flex min-w-0 items-center gap-2">
                  <EntityMark kind="resource" id={listing.productId} label={listing.product} size="sm" />
                  <span>
                    {listing.product} · <span className="num">{amount(listing.quantity)}</span> · <span className="num">{amount(listing.unitPrice)}</span> each · {listing.seller}
                  </span>
                </span>
                <form action={action}>
                  <input type="hidden" name="intent" value="cancel" />
                  <input type="hidden" name="listingId" value={listing.id} />
                  <button disabled={pending} className="btn btn-secondary">
                    Cancel listing
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {listings.length === 0 ? <p className="panel text-sm text-muted">No goods are listed in this city.</p> : null}
      {listings.length > 0 ? (
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="min-w-0">
            {visible.length === 0 ? <p className="panel text-sm text-muted">No listing matches that search.</p> : null}
            <ul className="space-y-2">
              {visible.map((listing) => {
                const active = listing.id === selected?.id;
                const quote = purchaseQuote({
                  quantity: listing.quantity,
                  unitPrice: listing.unitPrice,
                  feePercent,
                  feeDiscountPercent,
                  salesTaxPercent: salesTax,
                });
                return (
                  <li key={listing.id}>
                    <button
                      type="button"
                      aria-pressed={active}
                      onClick={() => setSelectedId(listing.id)}
                      className={`flex w-full items-start gap-3 border px-3 py-2 text-left ${active ? "border-gold bg-raised" : "border-line bg-panel"}`}
                    >
                      <EntityMark kind="resource" id={listing.productId} category={listing.category} label={listing.product} />
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium">{listing.product}</span>
                        <span className="block text-xs text-muted">
                          {listing.category} · seller {listing.seller}
                        </span>
                      </span>
                      <span className="num shrink-0 text-sm">
                        {amount(listing.quantity)} × {amount(listing.unitPrice)}
                        <span className="block text-xs text-muted">goods {amount(quote.goods)}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
          <aside className="panel lg:sticky lg:top-24">
            {selected ? <ListingDetail listing={selected} currency={currency} feePercent={feePercent} feeDiscountPercent={feeDiscountPercent} salesTax={salesTax} hidden={!selectedVisible} confirmId={confirmId} setConfirmId={setConfirmId} action={action} pending={pending} /> : <p className="text-sm text-muted">Select a listing to read its price.</p>}
          </aside>
        </div>
      ) : null}
      {stock.length === 0 ? (
        <p className="panel text-sm text-muted">Nothing in your character stock here can be listed. Goods a company produces stay in that company until the owner lists them from the business page.</p>
      ) : (
      <form action={action} className="panel grid gap-2 sm:grid-cols-2">
        <h2 className="section-title sm:col-span-2">List your character&apos;s stock</h2>
        <p className="text-sm text-muted sm:col-span-2">The server lists only stock you hold in this city, at the price you set.</p>
        <input type="hidden" name="intent" value="list" />
        <input type="hidden" name="holderKind" value="character" />
        <input type="hidden" name="holderId" value={holderId} />
        <input type="hidden" name="placeId" value={placeId} />
        <input type="hidden" name="idempotencyKey" value={key} />
        <label className="text-sm">
          Good
          <select name="productId" className="field">
            {products
              .filter((product) => stock.some((item) => item.productId === product.id))
              .map((product) => (
              <option key={product.id} value={product.id}>
                {product.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Quantity
          <input name="quantity" type="number" min={1} max={100} required className="field" />
        </label>
        <label className="text-sm">
          Price each
          <input name="unitPrice" type="number" min={1} max={500} required className="field" />
        </label>
        <button disabled={pending} className="btn btn-secondary self-end">
          {pending ? "Listing…" : "List goods"}
        </button>
      </form>
      )}
    </div>
  );
}

function ListingDetail({
  listing,
  currency,
  feePercent,
  feeDiscountPercent,
  salesTax,
  hidden,
  confirmId,
  setConfirmId,
  action,
  pending,
}: {
  listing: Listing;
  currency: number;
  feePercent: number;
  feeDiscountPercent: number;
  salesTax: number;
  hidden: boolean;
  confirmId: string | null;
  setConfirmId: (id: string | null) => void;
  action: (formData: FormData) => void;
  pending: boolean;
}) {
  const quote = purchaseQuote({
    quantity: listing.quantity,
    unitPrice: listing.unitPrice,
    feePercent,
    feeDiscountPercent,
    salesTaxPercent: salesTax,
  });
  const shortfall = Math.max(0, quote.total - currency);
  return (
    <>
      <div className="flex items-start gap-3">
        <EntityMark kind="resource" id={listing.productId} category={listing.category} label={listing.product} />
        <div className="min-w-0">
          <p className="kicker">Listing</p>
          <h2 className="section-title mt-1">{listing.product}</h2>
        </div>
      </div>
      {hidden ? <p className="mt-2 text-xs text-muted">This listing is hidden by the current search.</p> : null}
      <p className="mt-2 text-sm text-muted">
        {listing.category} · seller {listing.seller}
      </p>
      <dl className="mt-3 space-y-1 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-muted">Quantity</dt>
          <dd className="num">{amount(listing.quantity)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted">Unit price</dt>
          <dd className="num">{amount(listing.unitPrice)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted">Goods price</dt>
          <dd className="num">{amount(quote.goods)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted">Market fee</dt>
          <dd className="num">{amount(quote.fee)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted">Sales tax</dt>
          <dd className="num">{amount(quote.tax)}</dd>
        </div>
        <div className="flex justify-between gap-3 border-t border-line pt-2">
          <dt>You pay</dt>
          <dd className="num">{amount(quote.total)}</dd>
        </div>
      </dl>
      <p className="mt-3 text-xs text-muted">
        {shortfall > 0
          ? `Your stored currency is ${amount(currency)}, short by ${amount(shortfall)}. The server rejects the purchase if the listing is closed or the balance is short.`
          : `Your stored currency is ${amount(currency)}. The server still rejects the purchase if the listing has closed.`}
      </p>
      {confirmId === listing.id ? (
        <form action={action} className="mt-3 space-y-2">
          <input type="hidden" name="listingId" value={listing.id} />
          <p className="text-xs text-muted">Buy this whole listing for {amount(quote.total)}. This cannot be undone here.</p>
          <div className="flex flex-wrap gap-2">
            <button name="intent" value="buy" disabled={pending} className="btn btn-primary">
              {pending ? "Buying…" : "Confirm purchase"}
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => setConfirmId(null)}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button type="button" className="btn btn-primary mt-3" disabled={pending} onClick={() => setConfirmId(listing.id)}>
          Buy
        </button>
      )}
    </>
  );
}
