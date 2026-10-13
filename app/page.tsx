import type { Metadata } from "next";
import { HeroSection } from "@/components/site/HeroSection";
import { PublicSiteFooter } from "@/components/site/PublicSiteFooter";
import { PublicSiteHeader } from "@/components/site/PublicSiteHeader";
import { BetaSection, CommunitySection, WorldSection } from "@/components/site/SiteSections";
import { siteVisitor } from "@/components/site/visitor";
import { getCurrentUser } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "SOVERYN",
  description: "A persistent multiplayer sandbox on a real-world map. One character, a real starting city, and a world that continues while you are away.",
};

export default async function HomePage() {
  const user = await getCurrentUser();
  const visitor = siteVisitor(user);

  return (
    <div className="website-page min-h-dvh text-ink">
      <PublicSiteHeader visitor={visitor} />
      <main id="main">
        <HeroSection visitor={visitor} />
        <WorldSection />
        <BetaSection visitor={visitor} />
        <CommunitySection />
      </main>
      <PublicSiteFooter visitor={visitor} />
    </div>
  );
}
