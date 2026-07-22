import { describe, expect, it } from "vitest";
import { isLossy, previewRoundTrip, roundTrip } from "@/lib/markdown/pipeline";

describe("math round-trip lossiness", () => {
  it("keeps single inline math stable", () => {
    const md = "Hello $x^2$ world.\n";
    expect(isLossy(md)).toBe(false);
    expect(roundTrip(md)).toBe(md);
  });

  it("keeps multiple inline maths on one line", () => {
    const md = "Compare $a$ and $b$ carefully.\n";
    expect(isLossy(md)).toBe(false);
  });

  it("keeps display math with surrounding paragraphs", () => {
    const md = "Before.\n\n$$\nx^2\n$$\n\nAfter.\n";
    expect(isLossy(md)).toBe(false);
    expect(previewRoundTrip(md)).toBe("Before.\n\n$$x^2$$\n\nAfter.\n");
  });

  it("keeps compact display math fences", () => {
    const md = "Before.\n\n$$x^2$$\n\nAfter.\n";
    expect(isLossy(md)).toBe(false);
    expect(roundTrip(md)).toBe(md);
  });

  it("does not invent blank lines between consecutive inlines", () => {
    const md = "A $x$ B $y$ C.\n";
    const out = previewRoundTrip(md);
    expect(out).not.toMatch(/\$\n/);
    expect(isLossy(md)).toBe(false);
  });
});
