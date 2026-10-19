import { formatCount } from "@/lib/game/format";

export function XpBar({ level, into, span }: { level: number; into: number; span: number }) {
  const width = span === 0 ? 100 : Math.min(100, Math.round((into / span) * 100));
  const remaining = span === 0 ? 0 : Math.max(0, span - into);
  return (
    <div>
      <div className="mb-1 flex justify-between gap-3 text-sm">
        <span>
          Level <span className="num">{formatCount(level)}</span>
        </span>
        <span className="num text-muted">{span === 0 ? "Highest configured level" : `${formatCount(into)} / ${formatCount(span)} XP`}</span>
      </div>
      <div
        className="h-2 overflow-hidden bg-obsidian"
        role="progressbar"
        aria-valuenow={span === 0 ? 1 : into}
        aria-valuemin={0}
        aria-valuemax={span === 0 ? 1 : span}
        aria-label={span === 0 ? `Level ${level}, highest configured level` : `Level ${level}, ${remaining} experience to the next level`}
      >
        <div className="h-full bg-gold" style={{ width: `${width}%` }} />
      </div>
      {span === 0 ? null : (
        <p className="mt-1 text-xs text-muted">
          <span className="num">{formatCount(remaining)}</span> XP to the next level
        </p>
      )}
    </div>
  );
}
