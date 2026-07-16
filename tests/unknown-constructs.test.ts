import { describe, expect, it } from "vitest";
import { parseBody, serializeBody } from "@/lib/markdown/pipeline";

/**
 * Spec §5.1: no raw HTML passthrough; unknown constructs are preserved as
 * literal text or rejected with a user-visible warning — never silently
 * mangled. These are lossy (the source toggle warns), but content must
 * survive.
 */
describe("unknown constructs are never silently dropped", () => {
  it("preserves GFM tables as literal text", () => {
    const md = "| col a | col b |\n|-------|-------|\n| 1     | 2     |\n";
    const out = serializeBody(parseBody(md));
    expect(out).toContain("col a");
    expect(out).toContain("col b");
  });

  it("preserves inline HTML as literal text (no passthrough)", () => {
    const md = "Text with <marquee>html</marquee> inside.\n";
    const doc = parseBody(md);
    const json = JSON.stringify(doc);
    // Content survives and no htmlBlock/htmlInline-like node exists.
    expect(json).toContain("marquee");
    expect(json).not.toContain('"type":"html');
  });
});
