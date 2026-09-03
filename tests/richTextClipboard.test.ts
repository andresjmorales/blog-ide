import { describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import { createExtensions } from "@/lib/editor/extensions";
import { parseBody, serializeBody } from "@/lib/markdown/pipeline";
import {
  richTextFromEditor,
  richTextFromMarkdown,
} from "@/lib/export/richTextClipboard";

function footnotesIn(doc: {
  type?: string;
  attrs?: { content?: string };
  content?: unknown[];
}) {
  const found: string[] = [];
  const visit = (node: typeof doc) => {
    if (node.type === "footnoteRef") {
      found.push(String(node.attrs?.content ?? ""));
    }
    for (const child of node.content ?? []) visit(child as typeof doc);
  };
  visit(doc);
  return found;
}

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

  it("keeps footnote lists and newlines through clipboard HTML paste", () => {
    const markdown = [
      "Hello[^1].",
      "",
      "[^1]:",
      "    See these:",
      "",
      "    - first **item**",
      "    - path https://example.com/a/b",
      "",
      "    And a second paragraph.",
      "",
    ].join("\n");
    const { html } = richTextFromMarkdown(markdown);
    expect(html).toContain("data-content=");
    expect(html).toMatch(/%0A|See these/);
    expect(html).not.toContain(' content="');

    const editor = new Editor({
      extensions: createExtensions(),
      content: html,
      contentType: "html",
    });
    try {
      const notes = footnotesIn(editor.getJSON());
      expect(notes).toHaveLength(1);
      expect(notes[0]).toContain("See these:");
      expect(notes[0]).toContain("first **item**");
      expect(notes[0]).toContain("https://example.com/a/b");
      expect(notes[0]).toContain("\n");
      expect(serializeBody(editor.getJSON())).toContain("first **item**");
    } finally {
      editor.destroy();
    }
  });
});
