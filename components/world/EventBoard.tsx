import Link from "next/link";
import { formatUtc } from "@/lib/world/clock";
import type { WorldEventView } from "@/lib/world/events";

function statusLabel(event: WorldEventView): string {
  if (event.status === "scheduled") return "Scheduled";
  if (event.status === "ended" && event.outcome === "met") return "Closed · goal met";
  if (event.status === "ended") return "Closed · goal not met";
  if (event.eligible) return "Open · you can contribute";
  return "Open";
}

export function EventBoard({ events }: { events: WorldEventView[] }) {
  const open = events.filter((event) => event.status === "active" || event.status === "scheduled");
  const closed = events.filter((event) => event.status === "ended");

  if (events.length === 0) {
    return (
      <section className="panel">
        <h2 className="section-title">Nothing open</h2>
        <p className="mt-2 text-sm text-muted">
          No work bulletin is scheduled or open. A bulletin appears only for a country that has an open starting city and a resident, and only after the previous window has cooled down.
        </p>
      </section>
    );
  }

  return (
    <div className="space-y-5">
      <section className="space-y-3">
        <h2 className="section-title">Open and scheduled</h2>
        {open.length === 0 ? <p className="text-sm text-muted">No bulletin is open. Recent closed bulletins are listed below.</p> : null}
        {open.map((event) => (
          <article key={event.id} className="panel">
            <p className="kicker">{statusLabel(event)}</p>
            <h3 className="mt-1 font-serif text-xl">{event.title}</h3>
            <p className="mt-2 text-sm">{event.detail}</p>
            <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
              <div>
                <dt className="kicker">Country</dt>
                <dd className="mt-1">
                  <Link href={`/map?country=${event.iso2}`} className="text-gold">
                    {event.countryName}
                  </Link>
                  <span className="text-muted"> · </span>
                  <Link href={`/politics/${event.iso2.toLowerCase()}`} className="text-gold">
                    Game politics
                  </Link>
                </dd>
              </div>
              <div>
                <dt className="kicker">Progress</dt>
                <dd className="num mt-1">
                  {event.progress} / {event.goal}
                </dd>
              </div>
              <div>
                <dt className="kicker">{event.status === "scheduled" ? "Opens" : "Ends"}</dt>
                <dd className="mt-1">{formatUtc(event.status === "scheduled" ? event.startsAt : event.endsAt)}</dd>
              </div>
            </dl>
            <p className="mt-3 text-sm text-muted">{event.playerNote}</p>
            {event.eligible ? (
              <p className="mt-3 text-sm">
                {event.contractAccepted ? (
                  <span className="text-muted">The bulletin contract is accepted. </span>
                ) : (
                  <>
                    <Link href="/missions" className="text-gold">
                      Accept the bulletin contract
                    </Link>
                    <span className="text-muted"> · </span>
                  </>
                )}
                <Link href="/businesses" className="text-gold">
                  Work a company shift
                </Link>
                <span className="text-muted"> · the map selection does not move you or finish this bulletin.</span>
              </p>
            ) : null}
          </article>
        ))}
      </section>
      <section className="space-y-3">
        <h2 className="section-title">Recently closed</h2>
        {closed.length === 0 ? <p className="text-sm text-muted">No bulletin has closed in the last 14 days.</p> : null}
        <ul className="space-y-2">
          {closed.map((event) => (
            <li key={event.id} className="panel-quiet px-4 py-3 text-sm">
              <p>{event.title}</p>
              <p className="text-muted">
                {statusLabel(event)} · {event.progress} of {event.goal} · ended {formatUtc(event.endsAt)}
              </p>
              <p className="text-muted">{event.playerNote}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
