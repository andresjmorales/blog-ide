import { describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import { createExtensions } from "@/lib/editor/extensions";
import { parseBody } from "@/lib/markdown/pipeline";
import {
  clearFindHighlights,
  findHighlightKey,
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
  it("clears match decorations when the document changes", () => {
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
      expect(state?.matches).toEqual([]);
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
});
