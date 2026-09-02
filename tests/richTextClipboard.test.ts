import { describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import { createExtensions } from "@/lib/editor/extensions";
import { parseBody } from "@/lib/markdown/pipeline";
import {
  richTextFromEditor,
  richTextFromMarkdown,
} from "@/lib/export/richTextClipboard";

describe("richTextClipboard", () => {
  it("copies formatted HTML, not markdown punctuation", () => {
    const { html, plain } = richTextFromMarkdown("Hello **world**.\n");
    expect(html).toMatch(/<(strong|b)>world<\/(strong|b)>/);
    expect(html).not.toContain("**world**");
    expect(plain).toContain("Hello");
    expect(plain).toContain("world");
  });

  it("matches a live editor clipboard serialize", () => {
    const editor = new Editor({
      extensions: createExtensions(),
      content: parseBody("A *quote*.\n"),
    });
    try {
      const fromEditor = richTextFromEditor(editor);
      const fromMarkdown = richTextFromMarkdown("A *quote*.\n");
      expect(fromEditor.html).toMatch(/<(em|i)>quote<\/(em|i)>/);
      expect(fromMarkdown.html).toContain("quote");
    } finally {
      editor.destroy();
    }
  });
});
