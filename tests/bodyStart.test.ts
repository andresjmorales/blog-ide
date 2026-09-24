import { describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import { NodeSelection, TextSelection } from "@tiptap/pm/state";
import { createExtensions } from "@/lib/editor/extensions";
import { parseBody } from "@/lib/markdown/pipeline";
import {
  bodyStartPos,
  placeCaretAtBodyStart,
} from "@/lib/editor/bodyStart";

function makeEditor(body: string) {
  const element = document.createElement("div");
  document.body.appendChild(element);
  return new Editor({
    element,
    extensions: createExtensions(),
    content: parseBody(body),
  });
}

describe("bodyStartPos", () => {
  it("skips a leading image to the first paragraph", () => {
    const editor = makeEditor("![Alt](https://example.com/x.png)\n\nFirst words.\n");
    try {
      const pos = bodyStartPos(editor.state.doc)!;
      expect(editor.state.doc.resolve(pos).parent.textContent).toBe(
        "First words."
      );
    } finally {
      editor.destroy();
    }
  });

  it("finds text nested in a leading blockquote or list", () => {
    const editor = makeEditor("---\n\n> Quoted opener.\n");
    try {
      const pos = bodyStartPos(editor.state.doc)!;
      expect(editor.state.doc.resolve(pos).parent.textContent).toBe(
        "Quoted opener."
      );
    } finally {
      editor.destroy();
    }
  });

  it("returns null when the body has no regular text", () => {
    const editor = makeEditor("![Alt](https://example.com/x.png)\n");
    try {
      expect(bodyStartPos(editor.state.doc)).toBeNull();
    } finally {
      editor.destroy();
    }
  });
});

describe("placeCaretAtBodyStart", () => {
  it("moves a load-time image node selection to the first paragraph", () => {
    const editor = makeEditor("![Alt](https://example.com/x.png)\n\nFirst words.\n");
    try {
      editor.view.dispatch(
        editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, 0))
      );
      placeCaretAtBodyStart(editor);
      const { selection } = editor.state;
      expect(selection).toBeInstanceOf(TextSelection);
      expect(selection.$from.parent.textContent).toBe("First words.");
      expect(editor.can().undo()).toBe(false);
    } finally {
      editor.destroy();
    }
  });
});
