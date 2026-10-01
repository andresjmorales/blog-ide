import { describe, expect, it } from "vitest";
import {
  isLossy,
  parseBody,
  serializeBody,
  tidyFootnoteContent,
} from "@/lib/markdown/pipeline";

describe("footnote whitespace tidy", () => {
  it("trims, collapses tabs and doubled spaces, keeps inline code", () => {
    expect(tidyFootnoteContent("\t  Tabbed\tthen  spaced `a  b`  ")).toBe(
      "Tabbed then spaced `a  b`"
    );
  });

  it("turns trailing-space hard breaks into a visible backslash", () => {
    expect(tidyFootnoteContent("one  \ntwo")).toBe("one\\\ntwo");
    expect(tidyFootnoteContent("one\\\n\ntwo")).toBe("one\n\ntwo");
  });

  it("collapses extra blank lines and leaves fenced code alone", () => {
    expect(tidyFootnoteContent("a\n\n\n\nb\n```\nx\t  y  \n```")).toBe(
      "a\n\nb\n```\nx\t  y  \n```"
    );
  });

  it("writes clean definitions and is stable", () => {
    const essay =
      "A[^1] b[^2].\n\n[^1]:\n    \tTabbed  start  \n[^2]:  spaced  \n";
    const once = serializeBody(parseBody(essay));
    expect(once).toBe("A[^1] b[^2].\n\n[^1]: Tabbed start\n[^2]: spaced");
    expect(serializeBody(parseBody(once))).toBe(once);
    expect(isLossy(essay)).toBe(false);
  });
});
