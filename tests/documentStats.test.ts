import { describe, expect, it } from "vitest";
import {
  collectDocumentStats,
  countWords,
  footnotePlainText,
  formatReadingTime,
  formatWordCount,
  readingMinutesFromWords,
  withFootnotes,
} from "@/lib/editor/documentStats";

type FakeNode = {
  type: { name: string };
  isText: boolean;
  isInline?: boolean;
  text?: string;
  attrs?: Record<string, unknown>;
  children?: FakeNode[];
  descendants: (
    f: (node: FakeNode, pos: number, parent: FakeNode | null) => boolean | void
  ) => void;
};

function text(value: string): FakeNode {
  return {
    type: { name: "text" },
    isInline: true,
    isText: true,
    text: value,
    descendants() {},
  };
}

function block(
  name: string,
  children: FakeNode[] = [],
  attrs?: Record<string, unknown>
): FakeNode {
  const node: FakeNode = {
    type: { name },
    isText: false,
    attrs,
    children,
    descendants(f) {
      for (const child of children) {
        const result = f(child, 0, node);
        if (result === false) continue;
        child.descendants(f);
      }
    },
  };
  return node;
}

function doc(children: FakeNode[]): FakeNode {
  const root: FakeNode = {
    type: { name: "doc" },
    isText: false,
    children,
    descendants(f) {
      for (const child of children) {
        const result = f(child, 0, root);
        if (result === false) continue;
        child.descendants(f);
      }
    },
  };
  return root;
}

describe("documentStats", () => {
  it("counts words including accented characters and contractions", () => {
    expect(countWords("Don't stop — café résumé")).toBe(4);
  });

  it("counts whitespace-delimited tokens like Substack", () => {
    expect(countWords("a well-known word—word and/or 14,000 e.g. 3.5%")).toBe(
      7
    );
    expect(countWords("see https://example.com/some-long-path?q=1")).toBe(2);
    expect(countWords("before — after & * ...")).toBe(2);
    expect(countWords("  ")).toBe(0);
  });

  it("strips footnote markdown down to reader-visible prose", () => {
    const plain = footnotePlainText(
      "See [the *paper*](https://example.com/a-b-c (x)) and <https://x.io/y> or $a + b$."
    );
    expect(countWords(plain)).toBe(5);
  });

  it("does not split words across mark boundaries", () => {
    const stats = collectDocumentStats(
      doc([
        block("paragraph", [text("un"), text("likely"), text(" ends.")]),
        block("paragraph", [text("next")]),
      ])
    );
    expect(stats.words).toBe(3);
  });

  it("collects essay stats and counts footnote bodies separately", () => {
    const stats = collectDocumentStats(
      doc([
        block("heading", [text("Intro")]),
        block("paragraph", [text("Hello world")]),
        block("paragraph", [
          text("More text"),
          { ...block("footnoteRef", [], { content: "nota al pie" }), isInline: true },
        ]),
        block("codeBlock", [text("const x = 1")]),
      ])
    );

    expect(stats.headings).toBe(1);
    expect(stats.paragraphs).toBe(2);
    // Intro + Hello world + More text (code block skipped)
    expect(stats.words).toBe(5);
    expect(stats.footnotes.words).toBe(3);
    expect(withFootnotes(stats, true).words).toBe(8);
    expect(withFootnotes(stats, false).words).toBe(5);
    expect(stats.characters).toBeGreaterThan(0);
    expect(stats.readingMinutes).toBe(1);
  });

  it("formats labels", () => {
    expect(formatWordCount(0)).toBe("0 words");
    expect(formatWordCount(1)).toBe("1 word");
    expect(formatReadingTime(0, 0)).toBe("0 min read");
    expect(formatReadingTime(1, 10)).toBe("1 min read");
    expect(readingMinutesFromWords(500)).toBe(2);
  });
});
