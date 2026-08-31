import { describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import { createExtensions } from "@/lib/editor/extensions";
import { parseBody, serializeBody } from "@/lib/markdown/pipeline";
import { normalizePastedHtml } from "@/lib/editor/normalizePastedWhitespace";
import { wrapUnicodeScriptsInHtml } from "@/lib/editor/unicodeScripts";

function textPos(editor: Editor, needle: string, offset = 0): number {
  let found = -1;
  editor.state.doc.descendants((node, pos) => {
    if (found >= 0 || !node.isText || !node.text) return;
    const index = node.text.indexOf(needle);
    if (index >= 0) found = pos + index + offset;
  });
  return found;
}

function makeEditor(body = "Hello.\n") {
  const element = document.createElement("div");
  document.body.appendChild(element);
  return new Editor({
    element,
    extensions: createExtensions(),
    content: parseBody(body),
  });
}

describe("superscript and subscript marks", () => {
  it("toggles superscript on the selection", () => {
    const editor = makeEditor("E=mc2\n");
    try {
      const from = textPos(editor, "2");
      editor.commands.setTextSelection({ from, to: from + 1 });
      editor.commands.toggleSuperscript();
      expect(editor.isActive("superscript")).toBe(true);
      expect(serializeBody(editor.getJSON())).toContain("<sup>2</sup>");
    } finally {
      editor.destroy();
    }
  });

  it("toggles subscript and excludes superscript", () => {
    const editor = makeEditor("H2O\n");
    try {
      const from = textPos(editor, "2");
      editor.commands.setTextSelection({ from, to: from + 1 });
      editor.commands.toggleSuperscript();
      editor.commands.toggleSubscript();
      expect(editor.isActive("subscript")).toBe(true);
      expect(editor.isActive("superscript")).toBe(false);
      expect(serializeBody(editor.getJSON())).toContain("<sub>2</sub>");
    } finally {
      editor.destroy();
    }
  });

  it("parses pasted HTML sup/sub and vertical-align spans", () => {
    const editor = makeEditor("");
    try {
      editor.commands.setContent(
        normalizePastedHtml(
          '<p>E=mc<sup>2</sup> and H<span style="vertical-align:sub">2</span>O</p>'
        ),
        { contentType: "html" }
      );
      const md = serializeBody(editor.getJSON());
      expect(md).toContain("<sup>2</sup>");
      expect(md).toContain("<sub>2</sub>");
    } finally {
      editor.destroy();
    }
  });

  it("wraps unicode super/sub glyphs as HTML marks", () => {
    expect(wrapUnicodeScriptsInHtml("<p>E=mc² and H₂O</p>")).toContain(
      "<sup>2</sup>"
    );
    expect(wrapUnicodeScriptsInHtml("<p>E=mc² and H₂O</p>")).toContain(
      "<sub>2</sub>"
    );
  });
});
