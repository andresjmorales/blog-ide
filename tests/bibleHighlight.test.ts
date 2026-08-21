import { describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import { createExtensions } from "@/lib/editor/extensions";
import { parseBody } from "@/lib/markdown/pipeline";
import {
  BibleRefHighlight,
  bibleRefHighlightKey,
} from "@/lib/editor/bible/BibleRefHighlight";

function makeEditor(body: string): Editor {
  const element = document.createElement("div");
  document.body.appendChild(element);
  return new Editor({
    element,
    extensions: [...createExtensions(), BibleRefHighlight],
    content: parseBody(body),
  });
}

describe("BibleRefHighlight", () => {
  it("stays off until enabled, then decorates references", () => {
    const editor = makeEditor("See John 3:16 today.\n");
    try {
      expect(bibleRefHighlightKey.getState(editor.state)?.hits).toEqual([]);
      editor.commands.setBibleRefsEnabled(true);
      const hits = bibleRefHighlightKey.getState(editor.state)?.hits ?? [];
      expect(hits.map((hit) => hit.text)).toEqual(["John 3:16"]);
      editor.commands.setBibleRefsEnabled(false);
      expect(bibleRefHighlightKey.getState(editor.state)?.hits).toEqual([]);
    } finally {
      editor.destroy();
    }
  });

  it("does not rewrite the document when highlighting", () => {
    const editor = makeEditor("See John 3:16 today.\n");
    try {
      const before = editor.getJSON();
      editor.commands.setBibleRefsEnabled(true);
      expect(editor.getJSON()).toEqual(before);
    } finally {
      editor.destroy();
    }
  });

  it("keeps a distant reference when typing in another paragraph", () => {
    const editor = makeEditor("See John 3:16 today.\n\nAnd more text.\n");
    try {
      editor.commands.setBibleRefsEnabled(true);
      const before = bibleRefHighlightKey.getState(editor.state)?.hits ?? [];
      expect(before.map((hit) => hit.text)).toEqual(["John 3:16"]);
      editor.commands.focus("end");
      editor.commands.insertContent(" extra");
      const after = bibleRefHighlightKey.getState(editor.state)?.hits ?? [];
      expect(after.map((hit) => hit.text)).toEqual(["John 3:16"]);
      expect(after[0]?.from).toBe(before[0]?.from);
      expect(after[0]?.to).toBe(before[0]?.to);
    } finally {
      editor.destroy();
    }
  });

  it("keeps references when only a footnote attr changes", () => {
    const editor = makeEditor("See John 3:16 today.[^1]\n\n[^1]: old note\n");
    try {
      editor.commands.setBibleRefsEnabled(true);
      const before = bibleRefHighlightKey.getState(editor.state)?.hits ?? [];
      expect(before.map((hit) => hit.text)).toEqual(["John 3:16"]);
      let footnotePos: number | null = null;
      editor.state.doc.descendants((node, pos) => {
        if (node.type.name === "footnoteRef") {
          footnotePos = pos;
          return false;
        }
      });
      expect(footnotePos).toBeTypeOf("number");
      const node = editor.state.doc.nodeAt(footnotePos!);
      editor.view.dispatch(
        editor.state.tr.setNodeMarkup(footnotePos!, undefined, {
          ...node!.attrs,
          content: "updated note body",
        })
      );
      const after = bibleRefHighlightKey.getState(editor.state)?.hits ?? [];
      expect(after.map((hit) => hit.text)).toEqual(["John 3:16"]);
      expect(after[0]?.from).toBe(before[0]?.from);
    } finally {
      editor.destroy();
    }
  });

  it("picks up a new reference in the edited paragraph", () => {
    const editor = makeEditor("Hello world.\n\nSee John 3:16.\n");
    try {
      editor.commands.setBibleRefsEnabled(true);
      expect(
        bibleRefHighlightKey.getState(editor.state)?.hits.map((hit) => hit.text)
      ).toEqual(["John 3:16"]);
      editor.commands.insertContentAt(1, "Romans 8:28 and ");
      const texts =
        bibleRefHighlightKey.getState(editor.state)?.hits.map((hit) => hit.text) ??
        [];
      expect(texts).toEqual(["Romans 8:28", "John 3:16"]);
    } finally {
      editor.destroy();
    }
  });
});
