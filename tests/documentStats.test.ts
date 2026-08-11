import { describe, expect, it } from "vitest";
import {
  collectDocumentStats,
  countWords,
  formatReadingTime,
  formatWordCount,
  readingMinutesFromWords,
} from "@/lib/editor/documentStats";

type FakeNode = {
  type: { name: string };
  isText: boolean;
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

  it("collects essay stats and includes footnote bodies", () => {
    const stats = collectDocumentStats(
      doc([
        block("heading", [text("Intro")]),
        block("paragraph", [text("Hello world")]),
        block("paragraph", [
          text("More text"),
          block("footnoteRef", [], { content: "nota al pie" }),
        ]),
        block("codeBlock", [text("const x = 1")]),
      ])
    );

    expect(stats.headings).toBe(1);
    expect(stats.paragraphs).toBe(2);
    // Intro + Hello world + More text + nota al pie (code block skipped)
    expect(stats.words).toBe(8);
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
