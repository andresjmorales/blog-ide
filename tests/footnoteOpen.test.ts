import { afterEach, describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import { createExtensions } from "@/lib/editor/extensions";
import { parseBody } from "@/lib/markdown/pipeline";
import {
  clearFootnoteEditorOpenQueue,
  consumeFootnoteEditorOpen,
  queueFootnoteEditorOpen,
} from "@/lib/editor/footnoteOpen";

describe("footnote editor open queue", () => {
  afterEach(() => {
    clearFootnoteEditorOpenQueue();
  });

  it("consumes a queued id once", () => {
    queueFootnoteEditorOpen("fn-1");
    expect(consumeFootnoteEditorOpen("fn-1")).toBe(true);
    expect(consumeFootnoteEditorOpen("fn-1")).toBe(false);
    expect(consumeFootnoteEditorOpen("other")).toBe(false);
  });

  it("queues the inserted footnote so its editor can open on mount", () => {
    const element = document.createElement("div");
    document.body.appendChild(element);
    const editor = new Editor({
      element,
      extensions: createExtensions({ typography: false }),
      content: parseBody("Hello.\n"),
    });
    try {
      expect(editor.commands.insertFootnote()).toBe(true);
      let id = "";
      editor.state.doc.descendants((node) => {
        if (node.type.name === "footnoteRef") {
          id = String(node.attrs.id);
        }
      });
      expect(id).not.toBe("");
      expect(consumeFootnoteEditorOpen(id)).toBe(true);
    } finally {
      editor.destroy();
      element.remove();
    }
  });
});
