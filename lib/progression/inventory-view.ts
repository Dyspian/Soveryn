export type InventorySort = "name" | "quantity" | "category";

export type InventoryViewItem = {
  id: string;
  name: string;
  category: string;
  quantity: number;
};

export function filterInventory<T extends InventoryViewItem>(
  items: T[],
  query: string,
  category: string,
  sort: InventorySort,
): T[] {
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
}
