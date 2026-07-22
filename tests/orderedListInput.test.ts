import { describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import { createExtensions } from "@/lib/editor/extensions";
import { parseBody, serializeBody } from "@/lib/markdown/pipeline";

function makeEditor(body = ""): Editor {
  const element = document.createElement("div");
  document.body.appendChild(element);
  return new Editor({
    element,
    extensions: createExtensions(),
    content: parseBody(body),
  });
}

/**
 * Type through handleTextInput so ProseMirror input rules run.
 * tr.insertText / insertContent bypass those handlers.
 */
function typeText(editor: Editor, text: string) {
  editor.commands.focus("end");
  for (const char of text) {
    const { from, to } = editor.state.selection;
    const handled = editor.view.someProp("handleTextInput", (fn) =>
      fn(editor.view, from, to, char, () =>
        editor.state.tr.insertText(char, from, to)
      )
    );
    if (!handled) {
      editor.view.dispatch(editor.state.tr.insertText(char, from, to));
    }
  }
}

describe("ordered list input rules", () => {
  it("converts only '1. ' into an ordered list", () => {
    const editor = makeEditor("");
    try {
      typeText(editor, "1. ");
      expect(editor.isActive("orderedList")).toBe(true);
    } finally {
      editor.destroy();
    }
  });

  it("keeps '123. ' as plain paragraph text", () => {
    const editor = makeEditor("");
    try {
      typeText(editor, "123. ");
      expect(editor.isActive("orderedList")).toBe(false);
      expect(serializeBody(editor.getJSON()).trim()).toBe("123.");
    } finally {
      editor.destroy();
    }
  });

  it("still parses markdown ordered lists that start above 1", () => {
    const md = "5. fifth\n6. sixth\n";
    const json = parseBody(md);
    expect(json.content?.[0]?.type).toBe("orderedList");
    const editor = makeEditor(md);
    try {
      const out = serializeBody(editor.getJSON());
      expect(out).toMatch(/fifth/);
      expect(out).toMatch(/sixth/);
    } finally {
      editor.destroy();
    }
  });
});
