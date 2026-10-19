import { describe, expect, it } from "vitest";
import { filterInventory } from "@/lib/progression/inventory-view";
import { skillProgress } from "@/lib/progression/rules";

const items = [
  { id: "field_notebook", name: "Field notebook", category: "record", quantity: 1 },
  { id: "local_shipment", name: "Local shipment", category: "cargo", quantity: 4 },
];

describe("inventory view", () => {
  it("filters by name and category without dropping the stored identity", () => {
    expect(filterInventory(items, "SHIP", "all", "name").map((item) => item.id)).toEqual(["local_shipment"]);
    expect(filterInventory(items, "", "record", "quantity").map((item) => item.id)).toEqual(["field_notebook"]);
    expect(filterInventory(items, "missing", "all", "name")).toEqual([]);
  });

  it("sorts by quantity, then by category, using the stored fields", () => {
    expect(filterInventory(items, "", "all", "quantity").map((item) => item.id)).toEqual(["local_shipment", "field_notebook"]);
    expect(filterInventory(items, "", "all", "category").map((item) => item.category)).toEqual(["cargo", "record"]);
  });
});

describe("skill progress", () => {
  it("uses the stored level band and stops at the maximum", () => {
    expect(skillProgress(25, 1, 20, 5)).toEqual({ into: 5, span: 20 });
    expect(skillProgress(100, 5, 20, 5)).toEqual({ into: 100, span: 0 });
    expect(skillProgress(0, 0, 0, 5)).toEqual({ into: 0, span: 0 });
  });
});
