import { describe, expect, it } from "vitest";
import { publicOrigin } from "@/lib/site/origin";

describe("public site origin", () => {
  it("accepts only an http origin without credentials", () => {
    expect(publicOrigin(undefined)).toBeNull();
    expect(publicOrigin("")).toBeNull();
    expect(publicOrigin("not a url")).toBeNull();
    expect(publicOrigin("javascript:alert(1)")?.href).toBeUndefined();
    expect(publicOrigin("https://user:pass@example.com")?.href).toBeUndefined();
    expect(publicOrigin("https://example.com/soveryn")?.origin).toBe("https://example.com");
    expect(publicOrigin(" http://localhost:3000 ")?.origin).toBe("http://localhost:3000");
  });
});
