import { describe, expect, it } from "vitest";
import { glyphFor, markCode, resolveGlyph, toneFor } from "@/components/game/marks";
import { formatCount } from "@/lib/game/format";

describe("game marks", () => {
  it("keeps a stable tone for the same party abbreviation", () => {
    expect(toneFor("ab")).toBe(toneFor("AB"));
  });

  it("maps known categories and leaves unknown ones generic", () => {
    expect(glyphFor("Cargo")).toBe("cargo");
    expect(glyphFor("politics")).toBe("politics");
    expect(glyphFor("not-a-category")).toBe("generic");
  });

  it("keeps one glyph for a resource id and does not invent one for an unknown id", () => {
    expect(resolveGlyph("resource", "crude_oil")).toBe("drop");
    expect(resolveGlyph("resource", "CRUDE_OIL")).toBe(resolveGlyph("resource", "crude_oil"));
    expect(resolveGlyph("resource", "gold")).not.toBe(resolveGlyph("currency"));
    expect(resolveGlyph("resource", "not_a_resource")).toBe("generic");
    expect(resolveGlyph("item", "field_notebook", "cargo")).toBe("notebook");
    expect(resolveGlyph("item", "unlisted_item", "cargo")).toBe("cargo");
    expect(resolveGlyph("business", "mining")).toBe("rock");
  });

  it("keeps a party tone stable when keyed by party id", () => {
    expect(toneFor("party-1")).toBe(toneFor("party-1"));
    expect(toneFor("party-1")).not.toBe(toneFor("AB"));
  });

  it("shortens codes without inventing letters", () => {
    expect(markCode(" fr ", 2)).toBe("FR");
    expect(markCode("alliance", 4)).toBe("ALLI");
  });

  it("formats safe counts and keeps an unsafe value as text", () => {
    expect(formatCount(1200)).toBe("1,200");
    expect(formatCount("12")).toBe("12");
    expect(formatCount("9007199254740993")).toBe("9007199254740993");
  });
});
