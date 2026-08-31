import { describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import { createExtensions } from "@/lib/editor/extensions";
import { parseBody } from "@/lib/markdown/pipeline";
import {
  collectRailNotes,
  footnoteNumberAt,
} from "@/lib/editor/footnoteNumbers";

function makeEditor(body: string) {
  return new Editor({
    extensions: createExtensions(),
    content: parseBody(body),
  });
}

describe("footnoteNumberAt", () => {
  it("numbers footnotes in document order and caches per doc", () => {
    const editor = makeEditor("One.[^1] Two.[^2]\n\n[^1]: first\n\n[^2]: second\n");
    try {
      const doc = editor.state.doc;
      const positions: number[] = [];
      const ids: string[] = [];
      doc.descendants((node, pos) => {
        if (node.type.name === "footnoteRef") {
          positions.push(pos);
          ids.push(String(node.attrs.id ?? ""));
        }
      });
      expect(positions).toHaveLength(2);
      expect(footnoteNumberAt(doc, positions[0], ids[0])).toBe(1);
      expect(footnoteNumberAt(doc, positions[1], ids[1])).toBe(2);
      expect(collectRailNotes(doc)).toHaveLength(2);
      expect(collectRailNotes(doc)).toBe(collectRailNotes(doc));
    } finally {
      editor.destroy();
    }
  });
});
