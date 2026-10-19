export function SkillMeter({ name, into, span }: { name: string; into: number; span: number }) {
  const width = span === 0 ? 100 : Math.min(100, Math.round((into / span) * 100));
  return (
    <div>
      <div className="mb-1 flex justify-between gap-3 text-xs text-muted">
        <span>{span === 0 ? "Maximum level" : "Toward the next level"}</span>
        <span className="num">{span === 0 ? "—" : `${into} / ${span} skill XP`}</span>
      </div>
      <div
        className="h-1.5 overflow-hidden bg-obsidian"
        role="progressbar"
        aria-valuenow={into}
        aria-valuemin={0}
        aria-valuemax={span === 0 ? Math.max(into, 1) : span}
        aria-label={span === 0 ? `${name} is at its maximum level` : `${name} progress`}
      >
        <div className="h-full bg-gold" style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}
