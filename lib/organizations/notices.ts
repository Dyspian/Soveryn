export type OrganizationNotice = {
  id: string;
  kind: string;
  detail: string;
  read: boolean;
  createdAt: string;
  organizationId: string | null;
  organizationName: string | null;
  organizationTag: string | null;
};

export type NoticeFeed = {
  unread: number;
  notices: OrganizationNotice[];
};

const LABELS: Record<string, string> = {
  invitation: "Invitation",
  application: "Application",
  member: "Membership",
  removal: "Removal",
  rank: "Rank",
  leadership: "Leadership",
  contest: "Presence contest",
  operation: "Operation",
  investigation: "Investigation",
  delivery: "Delivery",
  agreement: "Agreement",
  rivalry: "Rivalry",
};

export function noticeLabel(kind: string): string {
  return LABELS[kind] ?? kind;
}

export function noticeNeedsAttention(kind: string): boolean {
  return kind === "removal" || kind === "investigation";
}

export function noticeHref(organizationId: string | null): string | null {
  if (!organizationId) return null;
  return `/organizations/${organizationId}`;
}

export function noticePanelBox(anchorRight: number, anchorBottom: number, viewportWidth: number): { top: number; left: number; width: number } {
  const margin = 8;
  const width = Math.min(352, Math.max(0, viewportWidth - margin * 2));
  let left = anchorRight - width;
  if (left < margin) left = margin;
  if (left + width > viewportWidth - margin) left = Math.max(margin, viewportWidth - margin - width);
  return { top: anchorBottom + margin, left, width };
}

export function hiddenUnread(unread: number, shownUnread: number): number {
  if (!Number.isFinite(unread) || !Number.isFinite(shownUnread)) return 0;
  return Math.max(0, Math.trunc(unread) - Math.trunc(shownUnread));
}
