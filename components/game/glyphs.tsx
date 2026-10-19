import type { Glyph } from "@/components/game/marks";

const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

export function GlyphShape({ glyph }: { glyph: Glyph }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {paths(glyph)}
    </svg>
  );
}

function paths(glyph: Glyph) {
  if (glyph === "notebook") return <><rect x="6" y="4" width="12" height="16" rx="1" {...stroke} /><path d="M9 8h6M9 12h6M9 16h4" {...stroke} /></>;
  if (glyph === "cargo") return <><path d="M4 8l8-4 8 4-8 4-8-4z" {...stroke} /><path d="M4 8v8l8 4 8-4V8M12 12v8" {...stroke} /></>;
  if (glyph === "explore") return <><circle cx="12" cy="12" r="7" {...stroke} /><path d="M12 5v2M12 17v2M5 12h2M17 12h2M9 9l6 6" {...stroke} /></>;
  if (glyph === "social") return <><circle cx="9" cy="9" r="2.5" {...stroke} /><circle cx="16" cy="10" r="2" {...stroke} /><path d="M5 17c.6-2 2.2-3 4-3s3.4 1 4 3M13 16.5c.5-1.4 1.6-2.2 3-2.2 1.2 0 2.2.6 2.8 1.7" {...stroke} /></>;
  if (glyph === "business") return <path d="M5 19V9h14v10M9 9V6h6v3M9 13h2M13 13h2M9 16h2M13 16h2" {...stroke} />;
  if (glyph === "politics") return <path d="M5 19h14M7 19V10h10v9M12 6l6 4H6l6-4z" {...stroke} />;
  if (glyph === "industry") return <path d="M4 19V10l5 3V10l5 3V8l6 3v8H4z" {...stroke} />;
  if (glyph === "plan") return <><circle cx="7" cy="7" r="2" {...stroke} /><circle cx="17" cy="8" r="2" {...stroke} /><circle cx="12" cy="17" r="2" {...stroke} /><path d="M9 8.2l6 .6M8.2 8.8l2.6 6.2M15.4 9.6l-2.2 5.6" {...stroke} /></>;
  if (glyph === "trade") return <path d="M7 7h11l-1.5 6h-8zM9 17h.01M16 17h.01M6 7L5 4" {...stroke} />;
  if (glyph === "drop") return <path d="M12 4s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11z" {...stroke} />;
  if (glyph === "flame") return <path d="M12 20c4 0 6-3 6-6 0-4-3-6-3-9-2 2-2 4-3 5-1-3-3-5-4-6 0 4-4 6-4 10 0 3 2 6 8 6z" {...stroke} />;
  if (glyph === "lump") return <path d="M6 16c0-4 2-7 6-8 1 2 3 2 4 1 3 1 4 4 3 7-1 3-4 4-8 4s-5-1-5-4z" {...stroke} />;
  if (glyph === "rock") return <path d="M5 16l3-7 4-2 5 3 3 6-4 3H8z" {...stroke} />;
  if (glyph === "coil") return <><ellipse cx="12" cy="8" rx="5" ry="2.2" {...stroke} /><path d="M7 8v8c0 1.2 2.2 2.2 5 2.2s5-1 5-2.2V8" {...stroke} /></>;
  if (glyph === "ingot") return <path d="M4 15l3-5h10l3 5-3 3H7z" {...stroke} />;
  if (glyph === "crystal") return <path d="M12 3l5 6-5 12L7 9z" {...stroke} />;
  if (glyph === "cell") return <><rect x="8" y="6" width="8" height="13" rx="1" {...stroke} /><path d="M10 6V4h4v2" {...stroke} /></>;
  if (glyph === "nugget") return <path d="M8 14c0-4 2-6 4-8 2 2 5 2 6 5 1 3-1 6-4 7-3 0-6-1-6-4z" {...stroke} />;
  if (glyph === "pellet") return <><circle cx="12" cy="12" r="3" {...stroke} /><path d="M12 4v3M12 17v3M4 12h3M17 12h3" {...stroke} /></>;
  if (glyph === "log") return <><rect x="4" y="8" width="14" height="8" rx="1" {...stroke} /><path d="M18 10h2M18 14h2M7 8v8M11 8v8" {...stroke} /></>;
  if (glyph === "stalk") return <path d="M12 20V8M12 12c-3-1-4-4-4-6 3 0 4 2 4 4M12 10c3-1 5-3 5-5-3 0-5 2-5 4" {...stroke} />;
  if (glyph === "canister") return <path d="M9 8h6v12H9zM10 8V5h4v3M9 12h6" {...stroke} />;
  if (glyph === "sack") return <path d="M8 9c0-3 8-3 8 0v9c0 2-2 3-4 3s-4-1-4-3zM9 9h6" {...stroke} />;
  if (glyph === "beam") return <path d="M4 16l8-8 8 8M8 16l4-4 4 4" {...stroke} />;
  if (glyph === "plate") return <path d="M5 8h14v8H5zM8 8v8M12 8v8M16 8v8" {...stroke} />;
  if (glyph === "crate") return <path d="M5 8h14v10H5zM5 12h14M12 8v10" {...stroke} />;
  if (glyph === "locked") return <><rect x="6" y="11" width="12" height="8" rx="1" {...stroke} /><path d="M9 11V8a3 3 0 0 1 6 0v3" {...stroke} /></>;
  if (glyph === "coin") return <><circle cx="12" cy="12" r="7" {...stroke} /><path d="M12 8v8M10 10h3a1.5 1.5 0 0 1 0 3h-2" {...stroke} /></>;
  return <circle cx="12" cy="12" r="6" {...stroke} />;
}
