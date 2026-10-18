import Link from "next/link";
import { siteFaq, faqJsonLd } from "@/components/site/faq";
import { PrimaryAction } from "@/components/site/PrimaryAction";
import { SectionHeading } from "@/components/site/SectionHeading";
import { discordInvite } from "@/lib/site/discord";
import { siteEntry, type SiteVisitor } from "@/components/site/visitor";

const steps = [
  {
    title: "Create an account",
    detail: "Use an email, a password of at least 8 characters, and accept the terms. Registration is open.",
  },
  {
    title: "Create your character",
    detail: "Choose a username, an open starting city, and a specialization. An account holds one character.",
  },
  {
    title: "Open the command center",
    detail: "Play starts there. A short guide points to the map, your character, and missions. You can dismiss it.",
  },
];

export function BetaSection({ visitor }: { visitor: SiteVisitor }) {
  const entry = siteEntry(visitor);
  return (
    <section id="beta" className="site-section" aria-labelledby="beta-title">
      <div className="mx-auto max-w-6xl min-w-0 px-4">
        <SectionHeading id="beta-title" kicker="Current access" title="Your story starts here.">
          <p>The game is in beta. Player progression will be wiped after beta.</p>
          <p className="mt-3">
            There is no invitation list. After the account, you create one character and choose an open starting city.
          </p>
        </SectionHeading>
        <ol className="mt-12 grid min-w-0 gap-8 md:grid-cols-3">
          {steps.map((step, index) => (
            <li key={step.title} className="min-w-0 border-t border-line pt-4">
              <p className="num text-sm text-gold">{String(index + 1).padStart(2, "0")}</p>
              <h3 className="mt-2 font-serif text-2xl tracking-wide">{step.title}</h3>
              <p className="mt-2 text-sm text-muted">{step.detail}</p>
            </li>
          ))}
        </ol>
        <p className="mt-8 text-sm text-muted">
          <Link href="/legal" className="text-gold">
            Terms and privacy
          </Link>
        </p>
        <div className="mt-8">
          <PrimaryAction href={entry.href}>{entry.label}</PrimaryAction>
        </div>
      </div>
    </section>
  );
}

export function CommunitySection() {
  const invite = discordInvite(process.env.SOVERYN_DISCORD_URL);
  return (
    <section id="community" className="site-section" aria-labelledby="community-title">
      <div className="mx-auto grid min-w-0 max-w-6xl items-start gap-12 px-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <SectionHeading id="community-title" kicker="Players" title="Gather inside the world.">
          <p>
            Organizations are how players gather, employ, and act together. Politics, work, and travel stay inside the
            game.
          </p>
        </SectionHeading>
        <div className="min-w-0">
          <div className="site-discord">
            <p className="kicker">Discord</p>
            {invite ? (
              <a href={invite} className="font-serif text-2xl text-gold" rel="noreferrer noopener" target="_blank">
                Open Discord
              </a>
            ) : (
              <p className="font-serif text-2xl text-ink">Coming soon</p>
            )}
            <p className="text-sm text-muted">
              {invite
                ? "The public Discord invite configured for this site."
                : "A public Discord server is not listed on this site yet."}
            </p>
          </div>
          <p className="mt-6 text-sm text-muted">
            <Link href="/legal" className="text-gold">
              Terms and privacy
            </Link>
            <span className="px-2 text-faint">/</span>
            <a href="#questions" className="text-gold">
              Common questions
            </a>
          </p>
        </div>
      </div>
    </section>
  );
}

export function FaqSection() {
  const data = faqJsonLd(siteFaq);
  return (
    <section id="questions" className="site-section" aria-labelledby="questions-title">
      <div className="mx-auto max-w-6xl min-w-0 px-4">
        <SectionHeading id="questions-title" kicker="Before you begin" title="A few plain answers.">
          <p>These answers match the current beta.</p>
        </SectionHeading>
        <div className="mt-8 max-w-3xl divide-y divide-line border-y border-line">
          {siteFaq.map((item) => (
            <details key={item.question} className="site-details py-3">
              <summary>{item.question}</summary>
              <p className="mt-2 max-w-2xl pb-2 text-sm text-muted">{item.answer}</p>
            </details>
          ))}
        </div>
      </div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }} />
    </section>
  );
}

export function ClosingSection({ visitor }: { visitor: SiteVisitor }) {
  const entry = siteEntry(visitor);
  const line =
    visitor.kind === "player"
      ? "Your character is already in the world."
      : visitor.kind === "recruit"
        ? "Your account is ready. Create one character to enter."
        : "Create an account, choose an open starting city, and play in the beta. Progression will be wiped after beta.";
  return (
    <section id="enter" className="site-close" aria-labelledby="enter-title">
      <div className="site-close-media" aria-hidden="true" />
      <div className="site-close-shade" aria-hidden="true" />
      <div className="relative z-10 mx-auto max-w-6xl min-w-0 px-4 py-20 md:py-28">
        <p className="kicker">Enter</p>
        <h2 id="enter-title" className="page-title mt-3 max-w-[14ch]">
          The world keeps moving.
        </h2>
        <p className="mt-5 max-w-xl text-ink/90">{line}</p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <PrimaryAction href={entry.href}>{entry.label}</PrimaryAction>
          {visitor.kind === "visitor" ? (
            <PrimaryAction href="/login" emphasis="secondary">
              Sign in
            </PrimaryAction>
          ) : null}
        </div>
      </div>
    </section>
  );
}
