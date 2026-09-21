import { Editor } from "@tiptap/core";
import type { EditorView } from "@tiptap/pm/view";
import { describe, expect, it } from "vitest";
import { createExtensions } from "@/lib/editor/extensions";
import { parseBody, roundTrip, serializeBody } from "@/lib/markdown/pipeline";
import { buildPublicationDocument, buildPublicationPreview } from "@/lib/preview/publicationHtml";
import type { JSONContent } from "@tiptap/core";

const POEM = `:::poetry
<sup>27</sup>All creatures look to You
  to give them their food in due season.
<sup>28</sup>When You give it to them,
  they gather it up;
when You open Your hand,
  they are satisfied with good things.
:::
`;

function poetryNode(doc: JSONContent): JSONContent | undefined {
  return doc.content?.find((node) => node.type === "poetry");
}

function nodeText(node: JSONContent | undefined): string {
  if (!node?.content) return "";
  return node.content
    .map((child) => (child.type === "text" ? child.text ?? "" : ""))
    .join("");
}

describe("poetry markdown", () => {
  it("keeps indents, tight breaks, superscripts, and quotes", () => {
    const doc = parseBody(POEM);
    const poem = poetryNode(doc);
    expect(poem?.type).toBe("poetry");
    const text = nodeText(poem);
    expect(text).toContain("\n  to give them their food in due season.");
    expect(text).toContain("\n  they gather it up;");
    expect(text).not.toMatch(/\n\n\n/);
    const sup = poem?.content?.find(
      (node) => node.marks?.some((mark) => mark.type === "superscript")
    );
    expect(sup?.text).toBe("27");
    expect(roundTrip(POEM)).toBe(POEM);
  });

  it("round-trips a poem inside a blockquote with inline italics", () => {
    const md = `> :::poetry
> <sup>27</sup>“All creatures look to You
>   to give them their food in due season.”
> *when You open Your hand,*
>   they are satisfied with good things.
> :::
`;
    expect(roundTrip(md)).toBe(md);
    const doc = parseBody(md);
    const quote = doc.content?.find((node) => node.type === "blockquote");
    const poem = quote?.content?.find((node) => node.type === "poetry");
    expect(nodeText(poem)).toContain("\n  to give them their food in due season.");
    expect(nodeText(poem)).toContain("“All creatures look to You");
    const italic = poem?.content?.some((node) =>
      node.marks?.some((mark) => mark.type === "italic")
    );
    expect(italic).toBe(true);
  });

  it("accepts a poetry div from markdown HTML and stores the fence", () => {
    const html = `<div class="poetry">
<sup>27</sup>All creatures look to You
  to give them their food in due season.
</div>
`;
    const doc = parseBody(html);
    const poem = poetryNode(doc);
    expect(nodeText(poem)).toContain("\n  to give them their food in due season.");
    expect(serializeBody(doc)).toContain(":::poetry");
    expect(serializeBody(doc)).toContain("  to give them their food in due season.");
  });
});

function pressKey(
  editor: Editor,
  key: string,
  mods: { ctrlKey?: boolean; shiftKey?: boolean; metaKey?: boolean } = {}
): boolean {
  const event = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
    ...mods,
  });
  const view = editor.view as EditorView;
  return view.someProp("handleKeyDown", (fn) => fn(view, event)) ?? false;
}

describe("poetry editing", () => {
  it("joins paragraphs into one block and leaves with Ctrl-style exit", () => {
    const editor = new Editor({
      extensions: createExtensions(),
      content: parseBody("All creatures look to You\n\n  to give them their food in due season.\n"),
    });
    try {
      editor.commands.selectAll();
      expect(editor.commands.togglePoetry()).toBe(true);
      const md = serializeBody(editor.getJSON());
      expect(md).toContain(":::poetry");
      expect(md).toContain("\n  to give them their food in due season.");
      expect(md).not.toContain("\n\n  to give");
      editor.commands.focus("end");
      expect(pressKey(editor, "Enter", { ctrlKey: true })).toBe(true);
      expect(editor.isActive("poetry")).toBe(false);
      expect(editor.isActive("paragraph")).toBe(true);
    } finally {
      editor.destroy();
    }
  });

  it("still splits a normal paragraph on Enter", () => {
    const editor = new Editor({
      extensions: createExtensions(),
      content: parseBody("One paragraph.\n"),
    });
    try {
      editor.commands.focus("end");
      expect(pressKey(editor, "Enter")).toBe(true);
      expect(editor.state.doc.childCount).toBe(2);
      expect(editor.isActive("paragraph")).toBe(true);
      expect(editor.isActive("poetry")).toBe(false);
    } finally {
      editor.destroy();
    }
  });

  it("inserts a close break on Enter and keeps a pasted indent", () => {
    const editor = new Editor({
      extensions: createExtensions(),
      content: parseBody(":::poetry\nAll creatures look to You\n:::\n"),
    });
    try {
      editor.commands.focus("end");
      expect(pressKey(editor, "Enter")).toBe(true);
      editor.commands.insertContent("  to give them their food in due season.");
      const text =
        editor.state.doc.firstChild?.textContent ?? "";
      expect(text).toBe(
        "All creatures look to You\n  to give them their food in due season."
      );
    } finally {
      editor.destroy();
    }
  });

  it("restores spaces from clipboard HTML", () => {
    const editor = new Editor({
      extensions: createExtensions(),
      content: parseBody("Before.\n"),
    });
    try {
      editor.commands.setContent(
        '<div class="poetry" data-type="poetry" style="white-space: pre-wrap"><sup>27</sup>All creatures look to You\n  to give them their food in due season.</div>',
        { contentType: "html" }
      );
      const poem = poetryNode(editor.getJSON());
      expect(nodeText(poem)).toContain("\n  to give them their food in due season.");
      expect(
        poem?.content?.some((node) =>
          node.marks?.some((mark) => mark.type === "superscript")
        )
      ).toBe(true);
    } finally {
      editor.destroy();
    }
  });
});

describe("poetry preview", () => {
  it("keeps the indent in Preview HTML and uses a close break", () => {
    const { bodyHtml } = buildPublicationPreview(POEM);
    expect(bodyHtml).toContain('class="poetry"');
    expect(bodyHtml).toContain("white-space: pre-wrap");
    expect(bodyHtml).toContain("  to give them their food in due season.");
    expect(bodyHtml).toContain("<sup>27</sup>");
    expect(bodyHtml).not.toContain("<p>  to give");
    const documentHtml = buildPublicationDocument(POEM);
    expect(documentHtml).toContain("white-space: pre-wrap");
    expect(documentHtml).toContain("  to give them their food in due season.");
  });
});
