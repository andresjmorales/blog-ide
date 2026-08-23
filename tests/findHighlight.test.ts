import { describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import { createExtensions } from "@/lib/editor/extensions";
import { parseBody } from "@/lib/markdown/pipeline";
import {
  clearFindHighlights,
  findHighlightKey,
  findHighlightStatesEqual,
  setFindHighlights,
} from "@/lib/editor/findHighlight";

function makeEditor(body: string): Editor {
  const element = document.createElement("div");
  document.body.appendChild(element);
  return new Editor({
    element,
    extensions: createExtensions(),
    content: parseBody(body),
  });
}

describe("findHighlight", () => {
  it("maps match decorations when the document changes", () => {
    const editor = makeEditor("alpha beta alpha\n");
    try {
      const matches = [
        { from: 1, to: 6, text: "alpha" },
        { from: 12, to: 17, text: "alpha" },
      ];
      setFindHighlights(editor, matches, 0, null);
      expect(findHighlightKey.getState(editor.state)?.matches).toHaveLength(2);

      editor.commands.insertContentAt(6, "X");

      const state = findHighlightKey.getState(editor.state);
      expect(state?.matches).toHaveLength(2);
      expect(state?.matches[0]).toMatchObject({ from: 1, to: 6 });
      expect(state?.matches[1]).toMatchObject({ from: 13, to: 18 });
      expect(state?.activeIndex).toBe(0);
    } finally {
      clearFindHighlights(editor);
      editor.destroy();
    }
  });

  it("keeps a mapped selection scope after edits", () => {
    const editor = makeEditor("alpha beta alpha\n");
    try {
      setFindHighlights(editor, [], 0, { from: 1, to: 11 });
      editor.commands.insertContentAt(6, "X");
      const scope = findHighlightKey.getState(editor.state)?.scopeRange;
      expect(scope).toEqual({ from: 1, to: 12 });
    } finally {
      clearFindHighlights(editor);
      editor.destroy();
    }
  });

  it("does not dispatch when highlight state is unchanged", () => {
    const editor = makeEditor("alpha beta alpha\n");
    try {
      const matches = [
        { from: 1, to: 6, text: "alpha" },
        { from: 12, to: 17, text: "alpha" },
      ];
      setFindHighlights(editor, matches, 0, null);
      let transactions = 0;
      editor.on("transaction", () => {
        transactions += 1;
      });
      expect(
        setFindHighlights(
          editor,
          [
            { from: 1, to: 6, text: "alpha" },
            { from: 12, to: 17, text: "alpha" },
          ],
          0,
          null
        )
      ).toBe(false);
      expect(transactions).toBe(0);
    } finally {
      clearFindHighlights(editor);
      editor.destroy();
    }
  });

  it("treats equivalent highlight states as equal", () => {
    expect(
      findHighlightStatesEqual(
        {
          matches: [{ from: 1, to: 4, text: "the", footnotePos: 8 }],
          activeIndex: 1,
          scopeRange: { from: 2, to: 9 },
        },
        {
          matches: [{ from: 1, to: 4, text: "other", footnotePos: 8 }],
          activeIndex: 1,
          scopeRange: { from: 2, to: 9 },
        }
      )
    ).toBe(true);
    expect(
      findHighlightStatesEqual(
        {
          matches: [{ from: 1, to: 4, text: "the" }],
          activeIndex: 0,
          scopeRange: null,
        },
        {
          matches: [{ from: 1, to: 5, text: "the" }],
          activeIndex: 0,
          scopeRange: null,
        }
      )
    ).toBe(false);
  });
});
