import path from "node:path";
import { SectionHeading } from "@/components/site/SectionHeading";
import { loadPublicActivity } from "@/lib/site/activity";
import type { PublicActivity } from "@/lib/site/activity-view";
import { formatUtc } from "@/lib/site/intelligence-view";
import { loadDeveloperUpdates, type DeveloperUpdate } from "@/lib/site/updates";
import { getSql } from "@/lib/db";
import { ensureDatabase } from "@/lib/ready";

function ActivityList({ items }: { items: PublicActivity[] | null }) {
  if (items === null) return <p className="mt-6 text-sm text-muted">World activity could not be read.</p>;
  if (items.length === 0) {
    return (
      <p className="mt-6 text-sm text-muted">
        No public political outcome is stored yet. Work bulletins stay in the snapshot above.
      </p>
    );
  }
  return (
    <ol className="mt-6 divide-y divide-line border-y border-line">
      {items.map((item) => (
        <li key={item.id} className="py-4">
          <p className="text-xs tracking-[0.14em] text-gold uppercase">{item.category}</p>
          <h4 className="mt-1 font-serif text-xl leading-snug">{item.summary}</h4>
          <p className="mt-2 text-sm text-muted">
            {item.countryName}
            <span className="px-2 text-faint">/</span>
            <time dateTime={item.occurredAt}>{formatUtc(item.occurredAt)}</time>
          </p>
        </li>
      ))}
    </ol>
  );
}

function UpdateList({ items }: { items: DeveloperUpdate[] | null }) {
  if (items === null) return <p className="mt-6 text-sm text-muted">Developer updates could not be read.</p>;
  if (items.length === 0) {
    return <p className="mt-6 text-sm text-muted">Official updates will appear here when the team publishes them.</p>;
  }
  return (
    <ol className="mt-6 divide-y divide-line border-y border-line">
      {items.map((item) => (
        <li key={item.id} className="py-4">
          <p className="text-xs tracking-[0.14em] text-gold uppercase">{item.category}</p>
          <h4 className="mt-1 font-serif text-xl leading-snug">{item.title}</h4>
          <p className="mt-2 text-sm text-muted">{item.summary}</p>
          <p className="mt-2 text-sm text-muted">
            <time dateTime={item.publishedAt}>{formatUtc(item.publishedAt)}</time>
          </p>
        </li>
      ))}
    </ol>
  );
}

export function RecordFallback() {
  return (
    <section id="record" className="site-section" aria-labelledby="record-title" aria-busy="true">
      <div className="mx-auto max-w-6xl px-4">
        <p className="kicker">Record</p>
        <h2 id="record-title" className="mt-2 font-serif text-3xl leading-tight tracking-wide md:text-4xl">
          World activity and updates
        </h2>
        <p className="mt-4 text-sm text-muted" role="status">
          Loading the public record.
        </p>
      </div>
    </section>
  );
}

export async function RecordSection() {
  let activity: PublicActivity[] | null = null;
  let updates: DeveloperUpdate[] | null = null;
  try {
    await ensureDatabase();
    activity = await loadPublicActivity(await getSql());
  } catch {
    activity = null;
  }
  try {
    updates = loadDeveloperUpdates(path.join(process.cwd(), "content", "updates"));
  } catch {
    updates = null;
  }

  return (
    <section id="record" className="site-section" aria-labelledby="record-title">
      <div className="mx-auto max-w-6xl min-w-0 px-4">
        <SectionHeading id="record-title" kicker="Record" title="World activity and updates">
          <p>
            World activity lists recorded political outcomes that use the server&apos;s own wording. Developer updates are
            separate posts from the team. Work bulletins stay in the snapshot above.
          </p>
        </SectionHeading>
        <div className="mt-12 grid min-w-0 gap-12 lg:grid-cols-2 lg:gap-16">
          <div className="min-w-0">
            <h3 className="font-serif text-2xl tracking-wide">World activity</h3>
            <ActivityList items={activity} />
          </div>
          <div className="min-w-0">
            <h3 className="font-serif text-2xl tracking-wide">Developer updates</h3>
            <UpdateList items={updates} />
          </div>
        </div>
      </div>
    </section>
  );
}
