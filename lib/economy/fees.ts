export function marketFee(baseFee: number, discountPercent: number): number {
  const discount = Math.max(0, discountPercent);
  return Math.max(0, baseFee - Math.floor((baseFee * discount) / 100));
}
