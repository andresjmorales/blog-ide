import { describe, expect, it } from "vitest";
import {
  footnoteRelabels,
  groupFootnoteRenumbers,
  unifiedLineDiff,
} from "@/lib/markdown/diff";
import { reviewDiff } from "@/lib/markdown/wordDiff";

const DIDACHE_BEFORE =
  "The Didache adds: “Let thine alms sweat into thine hands.”[^67] Isaac warns against it.";
const DIDACHE_AFTER =
  "The Didache adds: “Let thine alms sweat into thine hands.”[^76] Isaac warns against it.";
const QUOTE_BEFORE = "> For your part treat all men as worthy of goodness.[^68]";
const QUOTE_AFTER = "> For your part treat all men as worthy of goodness.[^77]";

describe("footnoteRelabels", () => {
  it("reports the relabelled footnotes when nothing else changed", () => {
    expect(footnoteRelabels(DIDACHE_BEFORE, DIDACHE_AFTER)).toEqual([
      { from: "67", to: "76" },
    ]);
    expect(footnoteRelabels("[^3]: Note.", "[^4]: Note.")).toEqual([
      { from: "3", to: "4" },
    ]);
  });

  it("is null for a real edit, an added footnote, or no change", () => {
    expect(footnoteRelabels("Old words.[^1]", "New words.[^2]")).toBeNull();
    expect(footnoteRelabels("Text.[^1]", "Text.[^1][^2]")).toBeNull();
    expect(footnoteRelabels("Text.[^1]", "Text.[^1]")).toBeNull();
  });
});

describe("groupFootnoteRenumbers", () => {
  it("folds renumber-only pairs and leaves real edits alone", () => {
    const before = ["Intro.", DIDACHE_BEFORE, QUOTE_BEFORE, "Old ending."].join("\n");
    const after = ["Intro.", DIDACHE_AFTER, QUOTE_AFTER, "New ending."].join("\n");
    const rows = groupFootnoteRenumbers(unifiedLineDiff(before, after));
    expect(rows).toEqual([
      { type: "context", text: "Intro." },
      {
        type: "renumber",
        before: DIDACHE_BEFORE,
        after: DIDACHE_AFTER,
        labels: [{ from: "67", to: "76" }],
      },
      {
        type: "renumber",
        before: QUOTE_BEFORE,
        after: QUOTE_AFTER,
        labels: [{ from: "68", to: "77" }],
      },
      { type: "remove", text: "Old ending." },
      { type: "add", text: "New ending." },
    ]);
  });

  it("folds paragraphs in the word-level review when asked", () => {
    const before = `Intro.\n\n${DIDACHE_BEFORE}\n\nOld ending.`;
    const after = `Intro.\n\n${DIDACHE_AFTER}\n\nNew ending.`;
    const types = reviewDiff(before, after, 1, { foldFootnoteRenumbers: true }).map(
      (row) => row.type
    );
    expect(types).toContain("renumber");
    expect(reviewDiff(before, after, 1).map((row) => row.type)).not.toContain(
      "renumber"
    );
  });
});
