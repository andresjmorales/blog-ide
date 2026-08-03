import { afterEach, describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import { createExtensions } from "@/lib/editor/extensions";
import { parseBody } from "@/lib/markdown/pipeline";

/**
 * TipTap stock Link sets inclusive from autolink; BlogideLink forces false
 * so typing after a link does not keep extending the mark (ROADMAP §5b).
 */
describe("BlogideLink inclusivity", () => {
  let editor: Editor | null = null;

  afterEach(() => {
    editor?.destroy();
    editor = null;
  });

  it("does not continue the link mark when typing after a link", () => {
    const element = document.createElement("div");
    document.body.appendChild(element);
    editor = new Editor({
      element,
      extensions: createExtensions(),
      content: parseBody("[Example](https://example.com)\n"),
    });

    // Place caret after the linked text (end of first textblock).
    const end = editor.state.doc.content.size - 1;
    editor.commands.setTextSelection(end);
    editor.commands.insertContent(" more");

    let linked = "";
    let plain = "";
    editor.state.doc.descendants((node) => {
      if (!node.isText || !node.text) return;
      if (node.marks.some((mark) => mark.type.name === "link")) {
        linked += node.text;
      } else {
        plain += node.text;
      }
    });

    expect(linked).toBe("Example");
    expect(plain).toContain("more");
  });

  it("exposes inclusive: false on the link mark type", () => {
    const element = document.createElement("div");
    document.body.appendChild(element);
    editor = new Editor({
      element,
      extensions: createExtensions(),
      content: parseBody("hi\n"),
    });
    const linkType = editor.schema.marks.link;
    expect(linkType).toBeTruthy();
    expect(linkType?.spec.inclusive).toBe(false);
  });
});
