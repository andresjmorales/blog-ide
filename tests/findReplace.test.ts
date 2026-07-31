import { describe, expect, it } from "vitest";
import {
  applyReplacement,
  findMatchesInText,
  replaceAllInText,
} from "@/lib/editor/findReplace";

describe("findReplace", () => {
  it("finds literal matches case-insensitively by default", () => {
    const matches = findMatchesInText("Foo foo FOO", {
      query: "foo",
      regex: false,
      caseSensitive: false,
    });
    expect(matches).toHaveLength(3);
  });

  it("supports regex capture-group replacements", () => {
    expect(
      replaceAllInText("See 12-14 and 3-4.", {
        query: "(\\d+)-(\\d+)",
        replacement: "$1–$2",
        regex: true,
        caseSensitive: true,
      })
    ).toBe("See 12–14 and 3–4.");
  });

  it("expands $& and $$ in replacements", () => {
    const match = /(\d+)-(\d+)/.exec("12-14");
    expect(match).toBeTruthy();
    expect(applyReplacement(match!, "[$&] $$ $1")).toBe("[12-14] $ 12");
  });

  it("returns empty for invalid regex", () => {
    expect(
      findMatchesInText("abc", {
        query: "(",
        regex: true,
        caseSensitive: true,
      })
    ).toEqual([]);
  });

  it("skips zero-length regex matches like \\d*", () => {
    const matches = findMatchesInText("ab 12 c 3", {
      query: "\\d*",
      regex: true,
      caseSensitive: true,
    });
    expect(matches.map((match) => match.text)).toEqual(["12", "3"]);
  });
});
