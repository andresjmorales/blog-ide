import { describe, expect, it } from "vitest";
import {
  applyBoundaryDashStyle,
  normalizePunctuation,
  toSmartQuotes,
} from "@/lib/editor/normalizePunctuation";

describe("normalizePunctuation", () => {
  it("converts spaced parenthetical hyphens to Chicago em dashes", () => {
    expect(
      normalizePunctuation("I am - don't worry - good.", {
        dashStyle: "chicago",
        smartQuotes: false,
      })
    ).toBe("I am—don't worry—good.");
  });

  it("converts spaced parenthetical hyphens to MLA spaced en dashes", () => {
    expect(
      normalizePunctuation("Yes - really - yes.", {
        dashStyle: "mla",
        smartQuotes: false,
      })
    ).toBe("Yes – really – yes.");
  });

  it("leaves compound hyphens and tight en dashes alone", () => {
    expect(
      normalizePunctuation("good-faith and military–industrial complex.", {
        dashStyle: "chicago",
        smartQuotes: false,
      })
    ).toBe("good-faith and military–industrial complex.");
  });

  it("leaves unspaced digit ranges alone by default", () => {
    expect(
      normalizePunctuation("See pages 12-14 and 12–14.", {
        dashStyle: "chicago",
        smartQuotes: false,
      })
    ).toBe("See pages 12-14 and 12–14.");
  });

  it("leaves spaced digit ranges alone (not parenthetical asides)", () => {
    expect(
      normalizePunctuation("See 15 - 16.", {
        dashStyle: "chicago",
        smartQuotes: false,
      })
    ).toBe("See 15 - 16.");
  });

  it("optionally normalizes digit ranges when digitRanges is true", () => {
    expect(
      normalizePunctuation("See pages 12-14.", {
        dashStyle: "chicago",
        smartQuotes: false,
        digitRanges: true,
      })
    ).toBe("See pages 12–14.");
  });

  it("applies smart quotes and apostrophes", () => {
    expect(toSmartQuotes(`"Hello," she said. It's fine.`)).toBe(
      "\u201CHello,\u201D she said. It\u2019s fine."
    );
  });

  it("optionally capitalizes sentence starts", () => {
    expect(
      normalizePunctuation("hello. world? yes!", {
        dashStyle: "chicago",
        smartQuotes: false,
        sentenceCase: true,
      })
    ).toBe("Hello. World? Yes!");
  });

  it("normalizes a spaced pause dash that starts a text node after a link letter", () => {
    expect(
      normalizePunctuation(
        " - really.",
        {
          dashStyle: "chicago",
          smartQuotes: false,
        },
        { before: "e" }
      )
    ).toBe("—really.");
    expect(applyBoundaryDashStyle(" - really.", "mla", "e", "")).toBe(
      " – really."
    );
  });

  it("does not treat unspaced leading hyphen as a pause dash", () => {
    expect(
      normalizePunctuation(
        "-really.",
        { dashStyle: "chicago", smartQuotes: false },
        { before: "e" }
      )
    ).toBe("-really.");
  });

  it("can run smart quotes without touching pause dashes", () => {
    expect(
      normalizePunctuation(`She said "hi" - really.`, {
        dashStyle: "chicago",
        smartQuotes: true,
        pauseDashes: false,
      })
    ).toBe(`She said \u201Chi\u201D - really.`);
  });
});
