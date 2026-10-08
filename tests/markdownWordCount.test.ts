import { describe, expect, it } from "vitest";
import {
  countMarkdownWords,
  markdownWordSplit,
} from "@/lib/editor/markdownWordCount";

describe("countMarkdownWords", () => {
  it("drops markup, link URLs, and images but keeps link text", () => {
    expect(
      countMarkdownWords(
        "# Title\n\nSee [the post](https://example.com/a) and **bold** text.\n\n![alt text](https://x.png)"
      )
    ).toBe(7);
  });

  it("counts footnote markers and labels like personal-site", () => {
    // One, two., ^1, ^1, :, Note, body.
    expect(countMarkdownWords("One two.[^1]\n\n[^1]: Note body.")).toBe(7);
  });

  it("does not let a bare `<` swallow text up to the next `>`", () => {
    // `>` is markup (blockquote) and drops; `<` stays a token.
    expect(countMarkdownWords("$$0 < s$$ one two three > four")).toBe(7);
  });

  it("strips real tags and comments", () => {
    expect(
      countMarkdownWords("ω<sup>1</sup> words\n\n<!--blogide-citations:[]-->")
    ).toBe(3);
  });
});

describe("markdownWordSplit", () => {
  it("separates footnote definitions from the body", () => {
    expect(
      markdownWordSplit("One two three.[^1]\n\n[^1]: A short note.\n")
    ).toEqual({ words: 4, footnoteWords: 5 });
  });

  it("counts everything as body when there are no footnotes", () => {
    expect(markdownWordSplit("Just four words here.")).toEqual({
      words: 4,
      footnoteWords: 0,
    });
  });
});
