import { describe, expect, it } from "vitest";
import { filterListings, purchaseQuote } from "@/lib/economy/quote";

describe("purchase quote", () => {
  it("uses the same fee and tax rounding as a purchase", () => {
    expect(
      purchaseQuote({ quantity: 4, unitPrice: 25, feePercent: 5, feeDiscountPercent: 0, salesTaxPercent: 25 }),
    ).toEqual({ goods: 100, fee: 5, tax: 25, total: 130 });
    expect(
      purchaseQuote({ quantity: 4, unitPrice: 25, feePercent: 5, feeDiscountPercent: 2, salesTaxPercent: 25 }).fee,
    ).toBe(5);
    expect(
      purchaseQuote({ quantity: 10, unitPrice: 100, feePercent: 10, feeDiscountPercent: 50, salesTaxPercent: 0 }),
    ).toEqual({ goods: 1000, fee: 50, tax: 0, total: 1050 });
    expect(purchaseQuote({ quantity: 1, unitPrice: 10, feePercent: 0, feeDiscountPercent: 0, salesTaxPercent: 1.5 }).tax).toBe(0);
  });
});

describe("market listings view", () => {
  const listings = [
    { id: "a", product: "Wheat", category: "agriculture", unitPrice: 8, quantity: 2 },
    { id: "b", product: "Steel", category: "industry", unitPrice: 3, quantity: 9 },
  ];

  it("filters and sorts stored listing fields", () => {
    expect(filterListings(listings, "ste", "all", "name").map((row) => row.id)).toEqual(["b"]);
    expect(filterListings(listings, "", "agriculture", "price").map((row) => row.id)).toEqual(["a"]);
    expect(filterListings(listings, "", "all", "quantity").map((row) => row.id)).toEqual(["b", "a"]);
    expect(filterListings(listings, "", "all", "price").map((row) => row.id)).toEqual(["b", "a"]);
    expect(filterListings(listings, "missing", "all", "name")).toEqual([]);
  });
});
