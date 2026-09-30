import { describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import { createExtensions } from "@/lib/editor/extensions";
import { parseBody, serializeBody } from "@/lib/markdown/pipeline";
import {
  findInEditor,
  replaceAllInEditor,
} from "@/lib/editor/findReplaceInEditor";

function makeEditor(body: string): Editor {
  const element = document.createElement("div");
  document.body.appendChild(element);
  return new Editor({
    element,
    extensions: createExtensions(),
    content: parseBody(body),
  });
}

describe("findReplaceInEditor", () => {
  it("finds only inside headings when scoped", () => {
    const editor = makeEditor("# Alpha\n\nAlpha in body\n\n## Beta\n");
    try {
      const matches = findInEditor(
        editor,
        { query: "Alpha", regex: false, caseSensitive: true },
        "headings"
      );
      expect(matches).toHaveLength(1);
      expect(matches[0].text).toBe("Alpha");
    } finally {
      editor.destroy();
    }
  });

  it("replaces digit hyphens with en dashes via regex groups", () => {
    const editor = makeEditor("See 12-14 and 3-4.\n");
    try {
      const { count } = replaceAllInEditor(
        editor,
        {
          query: "(\\d+)-(\\d+)",
          replacement: "$1–$2",
          regex: true,
          caseSensitive: true,
        },
        "document"
      );
      expect(count).toBe(2);
      expect(serializeBody(editor.getJSON())).toContain("12–14");
      expect(serializeBody(editor.getJSON())).toContain("3–4");
    } finally {
      editor.destroy();
    }
  });

  it("finds and replaces text inside footnote content attrs", () => {
    const editor = makeEditor(
      "See note[^1].\n\n[^1]: UniqueFootnoteToken here.\n"
    );
    try {
      const matches = findInEditor(
        editor,
        { query: "UniqueFootnoteToken", regex: false, caseSensitive: true },
        "document"
      );
      expect(matches).toHaveLength(1);
      expect(matches[0].footnotePos).toEqual(expect.any(Number));
      expect(matches[0].text).toBe("UniqueFootnoteToken");

      const { count } = replaceAllInEditor(
        editor,
        {
          query: "UniqueFootnoteToken",
          replacement: "ReplacedNote",
          regex: false,
          caseSensitive: true,
        },
        "document"
      );
      expect(count).toBe(1);
      const md = serializeBody(editor.getJSON());
      expect(md).toContain("ReplacedNote");
      expect(md).not.toContain("UniqueFootnoteToken");
      expect(md).toMatch(/\[\^[^\]]+\]/);
    } finally {
      editor.destroy();
    }
  });

  it("does not destroy footnotes when replacing nearby text", () => {
    const editor = makeEditor(
      "See 12-14[^1] please.\n\n[^1]: Keep this note.\n"
    );
    try {
      replaceAllInEditor(
        editor,
        {
          query: "(\\d+)-(\\d+)",
          replacement: "$1–$2",
          regex: true,
          caseSensitive: true,
        },
        "document"
      );
      const md = serializeBody(editor.getJSON());
      expect(md).toContain("12–14");
      expect(md).toMatch(/\[\^[^\]]+\]/);
      expect(md).toContain("Keep this note.");
    } finally {
      editor.destroy();
    }
  });
});
