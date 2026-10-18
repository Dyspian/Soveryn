import { describe, expect, it } from "vitest";
import { discordInvite } from "@/lib/site/discord";
import { faqJsonLd, siteFaq } from "@/components/site/faq";

describe("public community links", () => {
  it("accepts only a real Discord https invite", () => {
    expect(discordInvite(undefined)).toBeNull();
    expect(discordInvite("")).toBeNull();
    expect(discordInvite("https://example.com/soveryn")).toBeNull();
    expect(discordInvite("http://discord.gg/soveryn")).toBeNull();
    expect(discordInvite("javascript:alert(1)")).toBeNull();
    expect(discordInvite("https://discord.gg/soveryn")).toBe("https://discord.gg/soveryn");
    expect(discordInvite(" https://discord.com/invite/soveryn ")).toBe("https://discord.com/invite/soveryn");
  });

  it("keeps the beta answers free of a fabricated community link", () => {
    const text = siteFaq.map((item) => `${item.question} ${item.answer}`).join(" ");
    expect(text).not.toMatch(/discord\.gg|discord\.com/i);
    expect(text).toContain("wiped after beta");
    expect(text).toContain("no password reset");
    expect(text).toContain("coming soon");
    const data = faqJsonLd(siteFaq);
    expect(data.mainEntity.map((item) => item.name)).toEqual(siteFaq.map((item) => item.question));
    expect(data.mainEntity.map((item) => item.acceptedAnswer.text)).toEqual(siteFaq.map((item) => item.answer));
    expect(JSON.stringify(data)).not.toMatch(/aggregateRating|reviewCount|discord\.gg/i);
  });
});
