import type { Metadata } from "next";
import { Suspense } from "react";
import { HeroSection } from "@/components/site/HeroSection";
import { PublicSiteFooter } from "@/components/site/PublicSiteFooter";
import { PublicSiteHeader } from "@/components/site/PublicSiteHeader";
import { GameplayShowcase } from "@/components/site/GameplayShowcase";
import { BetaSection, ClosingSection, CommunitySection, FaqSection } from "@/components/site/SiteSections";
import { siteVisitor } from "@/components/site/visitor";
import { WorldIntelligenceFallback, WorldIntelligenceSection } from "@/components/site/WorldIntelligenceSection";
import { RecordFallback, RecordSection } from "@/components/site/RecordSection";
import { WorldPreview } from "@/components/site/WorldPreview";
import { publicOrigin } from "@/lib/site/origin";
import { getCurrentUser } from "@/lib/auth/session";

const description =
  "SOVERYN is a persistent multiplayer sandbox on a real-world map, currently in beta. One character, a real starting city, and a world that continues while you are away.";

export async function generateMetadata(): Promise<Metadata> {
  const origin = publicOrigin(process.env.SITE_URL);
  return {
    title: "SOVERYN",
    description,
    ...(origin ? { metadataBase: origin, alternates: { canonical: "/" } } : {}),
    openGraph: {
      title: "SOVERYN",
      description,
      type: "website",
      ...(origin ? { url: "/", images: [{ url: "/website-background.jpg", alt: "Site artwork of a world map and a coastal city at dusk." }] } : {}),
    },
  };
}

export default async function HomePage() {
  const user = await getCurrentUser();
  const visitor = siteVisitor(user);

  return (
    <div className="website-page min-h-dvh text-ink">
      <PublicSiteHeader visitor={visitor} />
      <main id="main">
        <HeroSection visitor={visitor} />
        <Suspense fallback={<WorldIntelligenceFallback />}>
          <WorldIntelligenceSection />
        </Suspense>
        <Suspense fallback={<RecordFallback />}>
          <RecordSection />
        </Suspense>
        <WorldPreview visitor={visitor} />
        <GameplayShowcase />
        <BetaSection visitor={visitor} />
        <CommunitySection />
        <FaqSection />
        <ClosingSection visitor={visitor} />
      </main>
      <PublicSiteFooter visitor={visitor} />
    </div>
  );
}
