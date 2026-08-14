import { describe, expect, it } from "vitest";
import {
  cleanWhitespace,
  collapseExtraBlankLines,
  selectionText,
} from "@/lib/editor/cleanWhitespace";
import { Editor } from "@tiptap/core";
import { createExtensions } from "@/lib/editor/extensions";
import { parseBody } from "@/lib/markdown/pipeline";

function makeEditor(body: string): Editor {
  const element = document.createElement("div");
  document.body.appendChild(element);
  return new Editor({
    element,
    extensions: createExtensions(),
    content: parseBody(body),
  });
}

describe("cleanWhitespace", () => {
  it("joins Shift-Enter / PDF wraps to spaces", () => {
    expect(cleanWhitespace("hello\nworld\r\n  from\tPDF")).toBe(
      "hello world from PDF"
    );
  });

  it("trims ends", () => {
    expect(cleanWhitespace("  padded  \n")).toBe("padded");
  });

  it("keeps a true paragraph break (blank line)", () => {
    expect(cleanWhitespace("hello\n\nworld")).toBe("hello\n\nworld");
  });

  it("collapses extra empty lines to one paragraph break", () => {
    expect(cleanWhitespace("hello\n\n\n\nworld")).toBe("hello\n\nworld");
    expect(cleanWhitespace("hello\n \n \nworld")).toBe("hello\n\nworld");
  });

  it("joins wraps inside a paragraph but keeps the next paragraph", () => {
    expect(
      cleanWhitespace("Line one of a wrapped\nparagraph from a PDF.\n\nNext.")
    ).toBe("Line one of a wrapped paragraph from a PDF.\n\nNext.");
  });
});

describe("collapseExtraBlankLines", () => {
  it("does not join Shift-Enter newlines", () => {
    expect(collapseExtraBlankLines("hello\nworld")).toBe("hello\nworld");
  });

  it("collapses three or more newlines to a paragraph break", () => {
    expect(collapseExtraBlankLines("hello\n\n\n\nworld")).toBe("hello\n\nworld");
  });
});

describe("selectionText", () => {
  it("extracts Shift-Enter hard breaks as a single newline", () => {
    const editor = makeEditor("hello  \nworld\n");
    try {
      const { from, to } = { from: 0, to: editor.state.doc.content.size };
      expect(selectionText(editor.state.doc, from, to)).toBe("hello\nworld");
    } finally {
      editor.destroy();
    }
  });

  it("extracts adjacent paragraphs as a blank line, not a Shift-Enter", () => {
    const editor = makeEditor("hello\n\nworld\n");
    try {
      const { from, to } = { from: 0, to: editor.state.doc.content.size };
      expect(selectionText(editor.state.doc, from, to)).toBe("hello\n\nworld");
    } finally {
      editor.destroy();
    }
  });
});
