/** Stored deadlines use UTC `timestamptz`. Player-local time is for display only. */
export function nowUtc(): Date {
  return new Date();
}

export function formatUtc(value: string | Date | null): string {
  if (!value) return "Not scheduled";
  return new Date(value).toISOString().replace(/\.\d{3}Z$/, " UTC").replace("T", " ");
}
