import { afterEach, describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import { createExtensions } from "@/lib/editor/extensions";
import { parseBody, serializeBody } from "@/lib/markdown/pipeline";
import { hitsFromBibtex } from "@/lib/citations/localHits";
import {
  insertCitationFootnote,
  readEssayCitations,
} from "@/lib/citations/insertCitation";
import {
  clearFootnoteEditorOpenQueue,
  consumeFootnoteEditorOpen,
} from "@/lib/editor/footnoteOpen";

describe("insert citation", () => {
  afterEach(() => {
    clearFootnoteEditorOpenQueue();
  });

  it("inserts a footnote and records the essay snapshot", () => {
    const element = document.createElement("div");
    document.body.appendChild(element);
    const editor = new Editor({
      element,
      extensions: createExtensions({ typography: false }),
      content: parseBody("Hello.\n"),
    });
    try {
      const hits = hitsFromBibtex(
        `@book{nussbaum2011,
  author = {Nussbaum, Martha C.},
  title = {Creating Capabilities},
  address = {Cambridge, MA},
  publisher = {Harvard University Press},
  year = {2011}
}`,
        "chicago-note-bibliography"
      );
      expect(hits).toHaveLength(1);
      const id = insertCitationFootnote(
        editor,
        {
          id: hits[0]!.id,
          provider: "bibtex",
          citeKey: hits[0]!.citeKey,
          title: hits[0]!.title,
          formatted: { "chicago-note": hits[0]!.formatted },
          bibtex: hits[0]!.bibtex,
        },
        hits[0]!.formatted
      );
      expect(id).toBeTruthy();
      expect(consumeFootnoteEditorOpen(id)).toBe(true);
      const citations = readEssayCitations(editor);
      expect(citations).toHaveLength(1);
      expect(citations[0]?.title).toBe("Creating Capabilities");
      expect(citations[0]?.footnoteIds).toEqual([id]);
      const md = serializeBody(editor.getJSON());
      expect(md).toContain("[^1]");
      expect(md).toContain("blogide-citations");
      expect(md).toContain("Creating Capabilities");
    } finally {
      editor.destroy();
      element.remove();
    }
  });

  it("deletes a footnote from the document", () => {
    const element = document.createElement("div");
    document.body.appendChild(element);
    const editor = new Editor({
      element,
      extensions: createExtensions({ typography: false }),
      content: parseBody("A claim.[^1]\n\n[^1]: Keep me.\n"),
    });
    try {
      let id = "";
      editor.state.doc.descendants((node) => {
        if (node.type.name === "footnoteRef") id = String(node.attrs.id);
      });
      expect(id).not.toBe("");
      expect(editor.commands.deleteFootnote(id)).toBe(true);
      const leftover: string[] = [];
      editor.state.doc.descendants((node) => {
        if (node.type.name === "footnoteRef") leftover.push(String(node.attrs.id));
      });
      expect(leftover).toEqual([]);
      const deleted = editor.state.doc.attrs.deletedFootnotes as Array<{
        id: string;
      }>;
      expect(deleted.some((entry) => entry.id === id)).toBe(true);
    } finally {
      editor.destroy();
      element.remove();
    }
  });

  it("drops a citation snapshot when its footnote is deleted", () => {
    const element = document.createElement("div");
    document.body.appendChild(element);
    const editor = new Editor({
      element,
      extensions: createExtensions({ typography: false }),
      content: parseBody("Hello.\n"),
    });
    try {
      const id = insertCitationFootnote(
        editor,
        {
          id: "lib-gone",
          provider: "library",
          citeKey: "gone",
          title: "Temporary",
          formatted: { "chicago-note": "Temporary unique footnote body." },
          url: "https://example.com/tmp",
        },
        "Temporary unique footnote body."
      );
      expect(readEssayCitations(editor)).toHaveLength(1);
      expect(editor.commands.deleteFootnote(id)).toBe(true);
      expect(readEssayCitations(editor)).toEqual([]);
    } finally {
      editor.destroy();
      element.remove();
    }
  });
});
