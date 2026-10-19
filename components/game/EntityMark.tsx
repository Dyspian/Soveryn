import { GlyphShape } from "@/components/game/glyphs";
import { markCode, resolveGlyph, toneFor, type MarkKind, type MarkTone } from "@/components/game/marks";

const GRAPHIC = new Set<MarkKind>(["item", "mission", "resource", "business", "currency"]);

export function EntityMark({
  kind,
  label,
  code,
  category,
  id,
  toneSeed,
  tone,
  size = "md",
}: {
  kind: MarkKind;
  label: string;
  code?: string;
  category?: string;
  id?: string | null;
  toneSeed?: string | null;
  tone?: MarkTone | "independent";
  size?: "sm" | "md";
}) {
  const graphic = GRAPHIC.has(kind);
  const shown = markCode(code || label, kind === "country" ? 2 : 4);
  const color = tone ?? (kind === "country" ? "gold" : toneFor(toneSeed || id || code || label || category || kind));
  return (
    <span
      className={`entity-mark entity-mark-${color} ${size === "sm" ? "entity-mark-sm" : ""}`}
      aria-hidden="true"
      title={label}
    >
      {graphic ? <GlyphShape glyph={resolveGlyph(kind, id, category)} /> : shown}
    </span>
  );
}
