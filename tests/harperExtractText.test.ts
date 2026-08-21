import { describe, expect, it } from "vitest";
import {
  extractLintBlocks,
  extractLintText,
  lintDocumentKey,
  mapSpanToRange,
} from "@/lib/editor/harper/extractText";
import { dialectFromLang, isHarperSupportedLang } from "@/lib/editor/harper/dialect";
import { Dialect } from "harper.js";

type FakeNode = {
  isText: boolean;
  isBlock: boolean;
  text?: string;
  nodeSize: number;
  type: { name: string };
  children?: FakeNode[];
  descendants: (
    f: (node: FakeNode, pos: number, parent: FakeNode | null) => boolean | void
  ) => void;
};

function text(value: string, pos: number): { node: FakeNode; pos: number } {
  return {
    pos,
    node: {
      isText: true,
      isBlock: false,
      text: value,
      nodeSize: value.length,
      type: { name: "text" },
      descendants() {},
    },
  };
}

function paragraph(children: Array<{ node: FakeNode; pos: number }>): FakeNode {
  const node: FakeNode = {
    isText: false,
    isBlock: true,
    nodeSize: 2,
    type: { name: "paragraph" },
    descendants(f) {
      for (const child of children) {
        const result = f(child.node, child.pos, node);
        if (result === false) continue;
        child.node.descendants(f);
      }
    },
  };
  return node;
}

function doc(blocks: FakeNode[]): FakeNode {
  const root: FakeNode = {
    isText: false,
    isBlock: true,
    nodeSize: 2,
    type: { name: "doc" },
    descendants(f) {
      for (const block of blocks) {
        const result = f(block, 0, root);
        if (result === false) continue;
        block.descendants(f);
      }
    },
  };
  return root;
}

describe("harper extractText", () => {
  it("maps plaintext offsets back into text-node positions", () => {
    const map = extractLintText(
      doc([
        paragraph([text("Hello", 1)]),
        paragraph([text("world", 10)]),
      ])
    );
    expect(map.text).toBe("Hello\n\nworld");
    expect(map.posAt(0)).toBe(1);
    expect(map.posAt(4)).toBe(5);
    expect(mapSpanToRange(map, 0, 5)).toEqual({ from: 1, to: 6 });
    expect(mapSpanToRange(map, 7, 12)).toEqual({ from: 10, to: 15 });
  });

  it("splits textblocks and ignores footnote atoms", () => {
    const footnote: FakeNode = {
      isText: false,
      isBlock: false,
      nodeSize: 1,
      type: { name: "footnoteRef" },
      descendants() {},
    };
    const blocks = extractLintBlocks(
      doc([
        paragraph([text("Hello", 1), { node: footnote, pos: 6 }]),
        paragraph([text("world", 10)]),
      ])
    );
    expect(blocks.map((block) => block.text)).toEqual(["Hello", "world"]);
    expect(lintDocumentKey(blocks)).toBe("Hello\n\nworld");
    expect(blocks[0]?.from).toBe(1);
    expect(blocks[1]?.from).toBe(10);
  });
});

describe("harper dialect", () => {
  it("maps English tags and rejects others", () => {
    expect(dialectFromLang("en-US")).toBe(Dialect.American);
    expect(dialectFromLang("en-GB")).toBe(Dialect.British);
    expect(dialectFromLang("es")).toBeNull();
    expect(isHarperSupportedLang("en")).toBe(true);
    expect(isHarperSupportedLang("fr")).toBe(false);
  });
});
