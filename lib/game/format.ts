export function formatCount(value: number | string): string {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(numeric)) return String(value);
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(numeric);
}
