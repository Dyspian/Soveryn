import { SectionHeading } from "@/components/site/SectionHeading";
import { siteMissions, siteSkills, siteSpecializations } from "@/components/site/gameplay-catalog";

export function GameplayShowcase() {
  return (
    <section id="play" className="site-section" aria-labelledby="play-title">
      <div className="mx-auto max-w-6xl min-w-0 px-4">
        <SectionHeading id="play-title" kicker="How play works" title="One character, then the systems around them.">
          <p>These are the systems in this beta. Each one is stored on the server. None of the figures below are a live player&apos;s sheet.</p>
        </SectionHeading>

        <article className="mt-12 border-l-2 border-gold pl-5 md:pl-8">
          <h3 className="font-serif text-2xl tracking-wide">Character</h3>
          <p className="mt-3 max-w-2xl text-muted">
            An account holds one character. You choose a specialization, practice skills, and take missions. Experience
            and skill points stay on that character.
          </p>
          <details className="site-details mt-5">
            <summary>Specializations and skills in this version</summary>
            <p className="mt-3 text-sm text-muted">Specializations: {siteSpecializations.join(", ")}.</p>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {siteSkills.map((skill) => (
                <li key={skill} className="border-b border-line py-2 text-sm text-ink">
                  {skill}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-sm text-muted">Operational planning is a fictional in-game skill.</p>
          </details>
          <details className="site-details mt-3">
            <summary>Introductory missions</summary>
            <ul className="mt-3 space-y-2">
              {siteMissions.map((mission) => (
                <li key={mission} className="text-sm text-ink">
                  {mission}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-sm text-muted">Work bulletins are separate country contracts. They are not these introductory missions.</p>
          </details>
        </article>

        <div className="mt-14 grid min-w-0 gap-x-16 gap-y-10 md:grid-cols-2">
          <article>
            <h3 className="font-serif text-2xl tracking-wide">Work and trade</h3>
            <p className="mt-3 text-muted">
              Work a shift, run a business, take a job, or use the player market. Stock and payments are ledger records.
              This page does not show prices or someone else&apos;s balance.
            </p>
          </article>
          <article>
            <h3 className="font-serif text-2xl tracking-wide">Travel</h3>
            <p className="mt-3 text-muted">
              A journey moves your recorded city between stored places. Your political home does not change when you
              arrive.
            </p>
          </article>
          <article>
            <h3 className="font-serif text-2xl tracking-wide">Organizations</h3>
            <p className="mt-3 text-muted">
              Players can found an organization, keep it public or private, and open or close recruitment. Members share
              a treasury. Ranks decide who can invite, spend, and start an operation.
            </p>
          </article>
          <article>
            <h3 className="font-serif text-2xl tracking-wide">Politics</h3>
            <p className="mt-3 text-muted">
              A country can adopt a player-chosen constitution template. Parties, elections, bills, and offices are
              fictional game state. They are not real governments. Warfare and territorial conquest are not in this
              version.
            </p>
          </article>
        </div>

        <p className="mt-12 text-sm text-muted">
          <a href="#beta" className="text-gold">
            How to begin
          </a>
        </p>
      </div>
    </section>
  );
}
