const invitePattern = /^https:\/\/(discord\.gg|discord\.com)\/[A-Za-z0-9/_-]{2,80}$/;

export function discordInvite(value: string | undefined | null): string | null {
  const trimmed = value?.trim() ?? "";
  if (!invitePattern.test(trimmed)) return null;
  return trimmed;
}
