import { describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import { createExtensions } from "@/lib/editor/extensions";
import { parseBody, serializeBody } from "@/lib/markdown/pipeline";
import { applyConvertCase } from "@/lib/editor/applyConvertCase";
import { applyCleanWhitespace } from "@/lib/editor/applyCleanWhitespace";

function makeEditor(body: string): Editor {
  const element = document.createElement("div");
  document.body.appendChild(element);
  return new Editor({
    element,
    extensions: createExtensions(),
    content: parseBody(body),
  });
}

describe("applyConvertCase", () => {
  it("keeps Shift-Enter hard breaks instead of gluing words", () => {
    const editor = makeEditor("hello  \nworld\n");
    try {
      editor.commands.selectAll();
      applyConvertCase(editor, "upper");
      expect(serializeBody(editor.getJSON())).toBe("HELLO  \nWORLD");
    } finally {
      editor.destroy();
    }
  });

  it("sentence-cases across a Shift-Enter without capitalizing the next line", () => {
    const editor = makeEditor("hello  \nworld\n");
    try {
      editor.commands.selectAll();
      applyConvertCase(editor, "sentence");
      expect(serializeBody(editor.getJSON())).toBe("Hello  \nworld");
    } finally {
      editor.destroy();
    }
  });

  it("keeps paragraph breaks and marks", () => {
    const editor = makeEditor("**hello**\n\nworld\n");
    try {
      editor.commands.selectAll();
      applyConvertCase(editor, "upper");
      const md = serializeBody(editor.getJSON());
      expect(md).toContain("**HELLO**");
      expect(md).toContain("WORLD");
      expect(md.split("\n\n").length).toBeGreaterThanOrEqual(2);
    } finally {
      editor.destroy();
    }
  });
});

describe("applyCleanWhitespace", () => {
  it("replaces Shift-Enter hard breaks with spaces instead of deleting them", () => {
    const editor = makeEditor("hello  \nworld\n");
    try {
      editor.commands.selectAll();
      applyCleanWhitespace(editor);
      expect(serializeBody(editor.getJSON()).trim()).toBe("hello world");
    } finally {
      editor.destroy();
    }
  });

  it("keeps a paragraph break and collapses extra empty lines", () => {
    const editor = makeEditor("hello\n\n\n\nworld\n");
    try {
      editor.commands.selectAll();
      applyCleanWhitespace(editor);
      expect(serializeBody(editor.getJSON()).trim()).toBe("hello\n\nworld");
    } finally {
      editor.destroy();
    }
  });

  it("joins PDF-style wraps inside a paragraph and keeps the next paragraph", () => {
    const editor = makeEditor(
      "Line one of a wrapped\nparagraph from a PDF.\n\nNext paragraph.\n"
    );
    try {
      editor.commands.selectAll();
      applyCleanWhitespace(editor);
      expect(serializeBody(editor.getJSON()).trim()).toBe(
        "Line one of a wrapped paragraph from a PDF.\n\nNext paragraph."
      );
    } finally {
      editor.destroy();
    }
  });
});
