import { describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import { createExtensions } from "@/lib/editor/extensions";
import { parseBody, serializeBody } from "@/lib/markdown/pipeline";
import type { MarkdownTypingShortcuts } from "@/lib/settings";

function makeEditor(
  body = "",
  markdownTypingShortcuts: MarkdownTypingShortcuts = "conservative"
): Editor {
  const element = document.createElement("div");
  document.body.appendChild(element);
  return new Editor({
    element,
    extensions: createExtensions({ markdownTypingShortcuts }),
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

function docHasMark(editor: Editor, markName: string): boolean {
  let found = false;
  editor.state.doc.descendants((node) => {
    if (node.marks.some((mark) => mark.type.name === markName)) {
      found = true;
    }
  });
  return found;
}

describe("markdown typing shortcuts", () => {
  it("does not italicize *word* under conservative mode", () => {
    const editor = makeEditor("", "conservative");
    try {
      typeText(editor, "*word*");
      expect(docHasMark(editor, "italic")).toBe(false);
      // Serializer escapes literal asterisks.
      expect(serializeBody(editor.getJSON())).toMatch(/\\?\*word\\?\*/);
    } finally {
      editor.destroy();
    }
  });

  it("italicizes *word* under full mode", () => {
    const editor = makeEditor("", "full");
    try {
      typeText(editor, "*word*");
      expect(docHasMark(editor, "italic")).toBe(true);
    } finally {
      editor.destroy();
    }
  });

  it("still starts an ordered list with 1. under conservative mode", () => {
    const editor = makeEditor("", "conservative");
    try {
      typeText(editor, "1. ");
      expect(editor.isActive("orderedList")).toBe(true);
    } finally {
      editor.destroy();
    }
  });

  it("still wraps inline code with backticks under conservative mode", () => {
    const editor = makeEditor("", "conservative");
    try {
      typeText(editor, "`code`");
      expect(docHasMark(editor, "code")).toBe(true);
    } finally {
      editor.destroy();
    }
  });

  it("does not start a blockquote with > under conservative mode", () => {
    const editor = makeEditor("", "conservative");
    try {
      typeText(editor, "> ");
      expect(editor.isActive("blockquote")).toBe(false);
    } finally {
      editor.destroy();
    }
  });
});
