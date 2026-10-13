"use client";

import { useMemo, useState } from "react";
import type { CharacterSheet } from "@/lib/progression/service";

type Item = CharacterSheet["inventory"][number];
type SortKey = "name" | "quantity" | "category";

function amount(value: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

export function InventoryDesk({ items, currency }: { items: Item[]; currency: number }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [sort, setSort] = useState<SortKey>("name");
  const [selectedId, setSelectedId] = useState<string | null>(items[0]?.id ?? null);
  const categories = useMemo(() => [...new Set(items.map((item) => item.category))].sort(), [items]);
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matched = items.filter((item) => {
      if (category !== "all" && item.category !== category) return false;
      return needle.length === 0 || item.name.toLowerCase().includes(needle);
    });
    return [...matched].sort((left, right) => {
      if (sort === "quantity") return right.quantity - left.quantity || left.name.localeCompare(right.name);
      if (sort === "category") return left.category.localeCompare(right.category) || left.name.localeCompare(right.name);
      return left.name.localeCompare(right.name);
    });
  }, [items, query, category, sort]);
  const selected = items.find((item) => item.id === selectedId) ?? null;
  const filtering = query.trim().length > 0 || category !== "all" || sort !== "name";

  return (
    <div className="space-y-4">
      <p className="text-sm">
        Currency <span className="num text-gold">{amount(currency)}</span>
        <span className="text-muted"> · {amount(items.length)} {items.length === 1 ? "stack" : "stacks"}</span>
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="min-w-48 flex-1 text-sm">
          Search
          <input
            className="field"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Item name"
            type="search"
          />
        </label>
        <label className="text-sm">
          Category
          <select className="field" value={category} onChange={(event) => setCategory(event.target.value)}>
            <option value="all">All</option>
            {categories.map((entry) => (
              <option key={entry} value={entry}>
                {entry}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Sort
          <select className="field" value={sort} onChange={(event) => setSort(event.target.value as SortKey)}>
            <option value="name">Name</option>
            <option value="quantity">Quantity</option>
            <option value="category">Category</option>
          </select>
        </label>
        {filtering ? (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              setQuery("");
              setCategory("all");
              setSort("name");
            }}
          >
            Reset
          </button>
        ) : null}
      </div>
      {items.length === 0 ? (
        <p className="panel text-sm text-muted">No items are stored.</p>
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <ul className="space-y-2" role="listbox" aria-label="Inventory">
            {visible.length === 0 ? <li className="panel text-sm text-muted">No items match this search.</li> : null}
            {visible.map((item) => {
              const active = item.id === selected?.id;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={active}
                    onClick={() => setSelectedId(item.id)}
                    className={`flex w-full items-center gap-3 border px-3 py-2 text-left ${active ? "border-gold bg-panel" : "border-line bg-panel hover:border-line-strong"}`}
                  >
                    <span className="grid h-10 w-10 shrink-0 place-items-center border border-line font-serif text-gold uppercase" aria-hidden="true">
                      {item.category.slice(0, 1)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{item.name}</span>
                      <span className="block text-xs text-muted">{item.category}</span>
                    </span>
                    <span className="num shrink-0 text-muted">× {amount(item.quantity)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          <aside className="panel">
            {selected ? (
              <>
                <p className="kicker">Item</p>
                <h2 className="section-title mt-1">{selected.name}</h2>
                <p className="mt-2 text-sm text-muted">{selected.description}</p>
                <dl className="mt-4 space-y-2 text-sm">
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted">Quantity</dt>
                    <dd className="num">{amount(selected.quantity)}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted">Category</dt>
                    <dd>{selected.category}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted">Stack limit</dt>
                    <dd className="num">{amount(selected.stackLimit)}</dd>
                  </div>
                </dl>
                <p className="mt-4 text-sm text-muted">No equip, use, or discard action is available for stored items.</p>
              </>
            ) : (
              <p className="text-sm text-muted">Select an item to read its record.</p>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
