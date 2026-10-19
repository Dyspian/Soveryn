import { describe, expect, it } from "vitest";
import { hiddenUnread, noticeHref, noticeLabel, noticeNeedsAttention, noticePanelBox } from "@/lib/organizations/notices";

describe("organization notices", () => {
  it("labels stored kinds and leaves an unknown kind unchanged", () => {
    expect(noticeLabel("invitation")).toBe("Invitation");
    expect(noticeLabel("investigation")).toBe("Investigation");
    expect(noticeLabel("custom-kind")).toBe("custom-kind");
  });

  it("marks only removal and investigation as needing attention", () => {
    expect(noticeNeedsAttention("removal")).toBe(true);
    expect(noticeNeedsAttention("investigation")).toBe(true);
    expect(noticeNeedsAttention("delivery")).toBe(false);
  });

  it("links a notice only when it stores an organization", () => {
    expect(noticeHref(null)).toBeNull();
    expect(noticeHref("11111111-1111-1111-1111-111111111111")).toBe("/organizations/11111111-1111-1111-1111-111111111111");
  });

  it("keeps the notice panel inside a narrow viewport", () => {
    const narrow = noticePanelBox(202, 40, 390);
    expect(narrow.left).toBeGreaterThanOrEqual(8);
    expect(narrow.left + narrow.width).toBeLessThanOrEqual(382);
    const wide = noticePanelBox(900, 40, 1200);
    expect(wide.left).toBe(900 - wide.width);
  });

  it("counts unread notices that are outside the loaded list", () => {
    expect(hiddenUnread(5, 2)).toBe(3);
    expect(hiddenUnread(2, 2)).toBe(0);
    expect(hiddenUnread(1, 4)).toBe(0);
  });
});
