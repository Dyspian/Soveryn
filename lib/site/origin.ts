export function publicOrigin(value: string | undefined | null): URL | null {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (url.username || url.password) return null;
    return new URL(url.origin);
  } catch {
    return null;
  }
}
