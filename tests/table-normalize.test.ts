import { describe, expect, it } from "vitest";
import {
  isLossy,
  normalize,
  previewRoundTrip,
  serializeBody,
  parseBody,
} from "@/lib/markdown/pipeline";

describe("table separator canonicalize", () => {
  it("TipTap emits padded cells and --- separators", () => {
    const short = "| A | B |\n| - | - |\n| 1 | 2 |\n";
    expect(serializeBody(parseBody(short))).toBe(
      "| A   | B   |\n| --- | --- |\n| 1   | 2   |\n"
    );
  });

  it("short and padded separators are not lossy after normalize", () => {
    const short = "| A | B |\n| - | - |\n| 1 | 2 |\n";
    const padded = "| A | B |\n| ----- | ----- |\n| 1 | 2 |\n";
    expect(isLossy(short)).toBe(false);
    expect(isLossy(padded)).toBe(false);
    expect(normalize(short)).toBe(normalize(previewRoundTrip(short)));
    expect(normalize(padded)).toBe(normalize(previewRoundTrip(padded)));
  });

  it("preserves alignment colons on separators", () => {
    const aligned = "| A | B |\n| :- | -: |\n| 1 | 2 |\n";
    expect(isLossy(aligned)).toBe(false);
    expect(normalize(aligned)).toContain("| :--- | ---: |");
  });
});
