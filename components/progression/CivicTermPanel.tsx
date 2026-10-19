import Link from "next/link";
import { EntityMark } from "@/components/game/EntityMark";
import type { CivicTermView } from "@/lib/progression/terms";
import { formatUtc } from "@/lib/world/clock";

function statusLine(status: CivicTermView["status"]): string {
  if (status === "recorded") return "Recorded";
  if (status === "missed") return "Missed";
  return "Open";
}

export function CivicTermPanel({ term }: { term: CivicTermView }) {
  return (
    <section className="panel">
      <p className="kicker">This week</p>
      <h2 className="section-title mt-1">Civic term</h2>
      <p className="mt-2 text-sm text-muted">
        The term runs from {formatUtc(term.startsAt)} until {formatUtc(term.endsAt)}. One mission completion in that window pays {term.rewardReputation} reputation once. A missed week stays on the record. Currency, level, and inventory stay unchanged.
      </p>
      <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
        <div>
          <dt className="kicker">Status</dt>
          <dd className="mt-1">{statusLine(term.status)}</dd>
        </div>
        <div>
          <dt className="kicker">Ends</dt>
          <dd className="mt-1">{formatUtc(term.endsAt)}</dd>
        </div>
        <div>
          <dt className="kicker">Political home</dt>
          <dd className="mt-1 flex items-center gap-2">
            <EntityMark kind="country" code={term.countryIso2} label={term.countryName} size="sm" />
            <span>
              {term.countryName} · <span className="num">{term.countryRecorded}</span> recorded
            </span>
          </dd>
        </div>
      </dl>
      {term.status === "recorded" && term.sourceDetail ? <p className="mt-3 text-sm">{term.sourceDetail}</p> : null}
      {term.status === "open" ? (
        <p className="mt-3 text-sm">
          <Link href="/missions" className="text-gold">Complete a mission</Link>
          <span className="text-muted"> to record this term.</span>
        </p>
      ) : null}
      <h3 className="mt-4 text-sm text-muted">Earlier terms</h3>
      {term.history.length === 0 ? <p className="mt-1 text-sm text-muted">No earlier term is stored.</p> : null}
      <ul className="mt-1 space-y-1 text-sm">
        {term.history.map((item) => (
          <li key={item.termKey}>
            {item.termKey} · {statusLine(item.status)}
            {item.recordedAt ? ` · ${formatUtc(item.recordedAt)}` : ""}
            {item.sourceDetail ? ` · ${item.sourceDetail}` : ""}
          </li>
        ))}
      </ul>
    </section>
  );
}
