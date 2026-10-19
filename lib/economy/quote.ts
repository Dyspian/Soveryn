import { marketFee } from "@/lib/economy/fees";

export type PurchaseQuote = {
  goods: number;
  fee: number;
  tax: number;
  total: number;
};

export function purchaseQuote(input: {
  quantity: number;
  unitPrice: number;
  feePercent: number;
  feeDiscountPercent: number;
  salesTaxPercent: number;
}): PurchaseQuote {
  const goods = input.quantity * input.unitPrice;
  const baseFee = Math.floor((goods * input.feePercent) / 100);
  const fee = marketFee(baseFee, input.feeDiscountPercent);
  const tax =
    Number.isInteger(input.salesTaxPercent) && input.salesTaxPercent > 0
      ? Math.floor((goods * input.salesTaxPercent) / 100)
      : 0;
  return { goods, fee, tax, total: goods + fee + tax };
}

export type MarketSort = "name" | "price" | "quantity";

export function filterListings<T extends { product: string; category: string; unitPrice: number; quantity: number }>(
  listings: T[],
  query: string,
  category: string,
  sort: MarketSort,
): T[] {
  const needle = query.trim().toLowerCase();
  const matched = listings.filter((listing) => {
    if (category !== "all" && listing.category !== category) return false;
    return needle.length === 0 || listing.product.toLowerCase().includes(needle);
  });
  return [...matched].sort((left, right) => {
    if (sort === "price") return left.unitPrice - right.unitPrice || left.product.localeCompare(right.product);
    if (sort === "quantity") return right.quantity - left.quantity || left.product.localeCompare(right.product);
    return left.product.localeCompare(right.product);
  });
}
