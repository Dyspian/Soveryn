"use client";

import { useMemo, useState } from "react";
import { useActionState } from "react";
import { marketAction } from "@/lib/actions/economy";
import type { ActionResult } from "@/lib/actions/account";

type Listing = { id: string; productId: string; product: string; category: string; quantity: number; unitPrice: number; seller: string };
type Sale = { productId: string; name: string; unitPrice: number };
type Supply = { productId: string; name: string; quantity: number };
type Holding = { productId: string; name: string; quantity: number };
type OwnListing = { id: string; product: string; quantity: number; unitPrice: number; seller: string };

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
  const [sort, setSort] = useState<"name" | "price" | "quantity">("name");
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const categories = useMemo(() => [...new Set(listings.map((listing) => listing.category))].sort(), [listings]);
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matched = listings.filter((listing) => {
      const named = needle.length === 0 || listing.product.toLowerCase().includes(needle);
      return named && (category === "all" || listing.category === category);
    });
    return [...matched].sort((left, right) => {
      if (sort === "price") return left.unitPrice - right.unitPrice || left.product.localeCompare(right.product);
      if (sort === "quantity") return right.quantity - left.quantity || left.product.localeCompare(right.product);
      return left.product.localeCompare(right.product);
    });
  }, [listings, query, category, sort]);

  return (
    <div className="space-y-4">
      <p className="text-sm">
        Your currency <span className="num text-gold">{amount(currency)}</span>
        <span className="text-muted">
          {" "}
          · configured market fee {feePercent}% · this city&apos;s sales tax {salesTax}%
        </span>
      </p>
      <p className="text-sm text-muted">
        The goods price is quantity times the seller&apos;s unit price. The server adds the fee and sales tax when the purchase is saved. Negotiation can reduce the fee there.
      </p>
      {state?.ok ? <p className="text-sm text-gold" role="status">{state.message}</p> : null}
      {state && !state.ok ? <p className="text-sm text-danger" role="alert">{state.error}</p> : null}
      <div className="flex flex-wrap items-end gap-3">
        <label className="min-w-48 flex-1 text-sm">
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
              <li key={sale.productId}>
                {sale.name} · last sale <span className="num">{amount(sale.unitPrice)}</span> each
                {listed ? ` · ${amount(listed.quantity)} listed now` : " · nothing listed now"}
              </li>
            );
          })}
        </ul>
        {supply
          .filter((row) => !sales.some((sale) => sale.productId === row.productId))
          .map((row) => (
            <p key={row.productId} className="mt-1">
              {row.name} · <span className="num">{amount(row.quantity)}</span> listed now · no completed sale is recorded
            </p>
          ))}
      </section>
      <section className="text-sm">
        <h2 className="section-title">Your stock here</h2>
        {stock.length === 0 ? <p className="mt-1 text-muted">You are not holding goods in this city. Company stock is listed from the business page.</p> : null}
        <ul className="mt-1">
          {stock.map((item) => (
            <li key={item.productId}>
              {item.name} · <span className="num">{amount(item.quantity)}</span>
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
                <p>
                  {listing.product} · <span className="num">{amount(listing.quantity)}</span> · <span className="num">{amount(listing.unitPrice)}</span> each · {listing.seller}
                </p>
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
      {listings.length > 0 && visible.length === 0 ? <p className="panel text-sm text-muted">No listing matches that search.</p> : null}
      <ul className="space-y-2">
        {visible.map((listing) => {
          const goods = listing.quantity * listing.unitPrice;
          return (
            <li key={listing.id} className="panel flex flex-wrap items-center justify-between gap-3 text-sm">
              <div>
                <p className="font-medium">{listing.product}</p>
                <p className="text-muted">
                  <span className="num">{amount(listing.quantity)}</span> · <span className="num">{amount(listing.unitPrice)}</span> each · seller {listing.seller}
                </p>
                <p>
                  Goods price <span className="num">{amount(goods)}</span>
                </p>
              </div>
              {confirmId === listing.id ? (
                <form action={action} className="space-y-2">
                  <input type="hidden" name="listingId" value={listing.id} />
                  <p className="max-w-xs text-xs text-muted">Buy this whole listing. The server rejects it if the listing has closed or your currency is short.</p>
                  <div className="flex gap-2">
                    <button name="intent" value="buy" disabled={pending} className="btn btn-primary">
                      {pending ? "Buying…" : "Confirm purchase"}
                    </button>
                    <button type="button" className="btn btn-secondary" onClick={() => setConfirmId(null)}>
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <button type="button" className="btn btn-primary" disabled={pending} onClick={() => setConfirmId(listing.id)}>
                  Buy
                </button>
              )}
            </li>
          );
        })}
      </ul>
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
