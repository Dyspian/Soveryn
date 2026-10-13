export function XpBar({ level, into, span }: { level: number; into: number; span: number }) {
  const width = span === 0 ? 100 : Math.min(100, Math.round((into / span) * 100));
  return (
    <div>
      <div className="mb-1 flex justify-between text-sm">
        <span>Level <span className="num">{level}</span></span>
        <span className="num text-muted">{span === 0 ? "Highest configured level" : `${into} / ${span} XP`}</span>
      </div>
      <div className="h-1.5 overflow-hidden bg-obsidian" role="progressbar" aria-valuenow={width} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full bg-gold" style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}
