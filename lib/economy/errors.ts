export class EconomyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EconomyError";
  }
}

export function wholeAmount(value: unknown, label: string): number {
  const amount = typeof value === "bigint" ? Number(value) : Number(value);
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new EconomyError(`${label} must be a positive whole number.`);
  }
  return amount;
}

export function asCount(value: unknown): number {
  const amount = typeof value === "bigint" ? Number(value) : Number(value);
  if (!Number.isSafeInteger(amount)) throw new EconomyError("A stored quantity could not be read.");
  return amount;
}
