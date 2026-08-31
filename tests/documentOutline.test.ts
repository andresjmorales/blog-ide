import { describe, expect, it } from "vitest";
import {
  collectOutlineHeadings,
  outlineSnapshotsEqual,
  takeOutlineSnapshot,
} from "@/lib/editor/documentOutline";
import { collectDocumentStats } from "@/lib/editor/documentStats";

type FakeNode = {
  type: { name: string };
  isText: boolean;
  text?: string;
  textContent?: string;
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
    textContent: value,
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
    get textContent() {
      return children.map((child) => child.textContent ?? child.text ?? "").join("");
    },
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

describe("document outline snapshot", () => {
  it("collects headings and compares snapshots by value", () => {
    const tree = doc([
      block("heading", [text("Intro")], { level: 2 }),
      block("paragraph", [text("Hello world")]),
    ]);
    const first = takeOutlineSnapshot(tree);
    expect(collectOutlineHeadings(tree)).toEqual([
      { level: 2, text: "Intro", pos: 0 },
    ]);
    expect(first.stats.words).toBe(collectDocumentStats(tree).words);
    expect(outlineSnapshotsEqual(first, takeOutlineSnapshot(tree))).toBe(true);
    const changed = takeOutlineSnapshot(
      doc([
        block("heading", [text("Later")], { level: 2 }),
        block("paragraph", [text("Hello world")]),
      ])
    );
    expect(outlineSnapshotsEqual(first, changed)).toBe(false);
  });
});
