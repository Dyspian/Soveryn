"use client";

import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { EntityMark } from "@/components/game/EntityMark";
import { formatCount } from "@/lib/game/format";
import { filterInventory, type InventorySort } from "@/lib/progression/inventory-view";
import type { CharacterSheet } from "@/lib/progression/service";

type Item = CharacterSheet["inventory"][number];

function stackWidth(item: Item): number {
  if (item.stackLimit <= 0) return 0;
  return Math.min(100, Math.round((item.quantity / item.stackLimit) * 100));
}

export function InventoryDesk({ items, currency }: { items: Item[]; currency: number }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [sort, setSort] = useState<InventorySort>("name");
  const [selectedId, setSelectedId] = useState<string | null>(items[0]?.id ?? null);
  const detailRef = useRef<HTMLElement>(null);
  const categories = useMemo(() => [...new Set(items.map((item) => item.category))].sort(), [items]);
  const visible = useMemo(() => filterInventory(items, query, category, sort), [items, query, category, sort]);
  const selected = items.find((item) => item.id === selectedId) ?? null;
  const selectedVisible = selected ? visible.some((item) => item.id === selected.id) : false;
  const filtering = query.trim().length > 0 || category !== "all" || sort !== "name";

  function choose(id: string) {
    setSelectedId(id);
    if (window.matchMedia("(max-width: 1023px)").matches) {
      detailRef.current?.scrollIntoView({ block: "nearest" });
    }
  }

  function move(event: KeyboardEvent<HTMLUListElement>) {
    const keys = ["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp", "Home", "End"];
    if (!keys.includes(event.key) || visible.length === 0) return;
    event.preventDefault();
    const index = visible.findIndex((item) => item.id === selectedId);
    let next = 0;
    if (event.key === "Home") next = 0;
    else if (event.key === "End") next = visible.length - 1;
    else {
      const delta = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : -1;
      next = index < 0 ? 0 : (index + delta + visible.length) % visible.length;
    }
    const id = visible[next]?.id;
    if (!id) return;
    choose(id);
    const node = event.currentTarget.querySelector(`[data-item-id="${CSS.escape(id)}"]`);
    if (node instanceof HTMLElement) node.focus();
  }

  return (
    <div className="space-y-4">
      <p className="text-sm">
        <span className="inline-flex items-center gap-2">
          <EntityMark kind="currency" label="Currency" size="sm" />
          Currency <span className="num text-gold">{formatCount(currency)}</span>
        </span>
        <span className="text-muted">
          {" "}
          · {formatCount(items.length)} {items.length === 1 ? "stack" : "stacks"}
        </span>
      </p>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-end">
        <label className="min-w-0 text-sm">
          Search
          <input className="field" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Item name" type="search" />
        </label>
        <label className="text-sm">
          Category
          <select className="field" value={category} onChange={(event) => setCategory(event.target.value)} aria-label="Item category">
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
          <select className="field" value={sort} onChange={(event) => setSort(event.target.value as InventorySort)} aria-label="Sort items">
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
          <div className="min-w-0">
            <p className="mb-2 text-xs text-muted">
              {visible.length === items.length
                ? `${formatCount(visible.length)} shown`
                : `${formatCount(visible.length)} of ${formatCount(items.length)} shown`}
            </p>
            {visible.length === 0 ? <p className="panel text-sm text-muted">No items match this search.</p> : null}
            <ul className="item-grid" role="listbox" aria-label="Inventory" onKeyDown={move}>
              {visible.map((item) => {
                const active = item.id === selected?.id;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      role="option"
                      data-item-id={item.id}
                      aria-selected={active}
                      onClick={() => choose(item.id)}
                      className="item-tile"
                    >
                      <span className="flex w-full items-start justify-between gap-2">
                        <EntityMark kind="item" id={item.id} category={item.category} label={item.name} />
                        <span className="num text-xs text-muted">× {formatCount(item.quantity)}</span>
                      </span>
                      <span className="line-clamp-2 text-sm leading-snug">{item.name}</span>
                      <span className="text-xs text-muted">{item.category}</span>
                      <span className="stack-meter" aria-hidden="true">
                        <span style={{ width: `${stackWidth(item)}%` }} />
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
          <aside ref={detailRef} className="panel lg:sticky lg:top-24">
            {selected ? (
              <>
                <div className="flex items-start gap-3">
                  <EntityMark kind="item" id={selected.id} category={selected.category} label={selected.name} />
                  <div className="min-w-0">
                    <p className="kicker">Stored item</p>
                    <h2 className="section-title mt-1">{selected.name}</h2>
                  </div>
                </div>
                {selectedVisible ? null : <p className="mt-2 text-xs text-muted">This stack is hidden by the current search.</p>}
                <p className="mt-3 text-sm text-muted">{selected.description}</p>
                <dl className="mt-4 space-y-2 text-sm">
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted">Quantity</dt>
                    <dd className="num">{formatCount(selected.quantity)}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted">Category</dt>
                    <dd>{selected.category}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted">Stack limit</dt>
                    <dd className="num">
                      {formatCount(selected.quantity)} / {formatCount(selected.stackLimit)}
                    </dd>
                  </div>
                </dl>
                <div className="stack-meter mt-2" role="progressbar" aria-valuenow={selected.quantity} aria-valuemin={0} aria-valuemax={selected.stackLimit} aria-label={`${selected.name} stack`}>
                  <span style={{ width: `${stackWidth(selected)}%` }} />
                </div>
                <p className="mt-4 text-sm text-muted">
                  Stored items are not equipped, and this screen has no use or discard action. A mission that names an item spends it from here.
                </p>
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
