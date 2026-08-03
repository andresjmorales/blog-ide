import { describe, expect, it } from "vitest";
import { isLossy, parseBody, roundTrip } from "@/lib/markdown/pipeline";

describe("ordered list markdown (numeric only)", () => {
  it("keeps St. George as paragraph text (not a list)", () => {
    const md = "St. George did this.\n";
    expect(parseBody(md).content?.[0]?.type).toBe("paragraph");
    expect(isLossy(md)).toBe(false);
    expect(roundTrip(md)).toContain("St. George");
    expect(roundTrip(md)).not.toMatch(/^1\.\s/);
  });

  it("keeps Mr. / Dr. abbreviations as paragraphs", () => {
    expect(parseBody("Mr. Smith arrived.\n").content?.[0]?.type).toBe(
      "paragraph"
    );
    expect(parseBody("Dr. Jones left.\n").content?.[0]?.type).toBe(
      "paragraph"
    );
    expect(isLossy("Mr. Smith arrived.\n")).toBe(false);
  });

  it("still parses numeric ordered lists", () => {
    const md = "1. First\n2. Second\n";
    expect(parseBody(md).content?.[0]?.type).toBe("orderedList");
    expect(isLossy(md)).toBe(false);
  });

  it("does not treat a. / i. letter markers as ordered lists", () => {
    expect(parseBody("a. item\n").content?.[0]?.type).toBe("paragraph");
    expect(parseBody("i. item\n").content?.[0]?.type).toBe("paragraph");
    expect(isLossy("a. item\n")).toBe(false);
  });
});
