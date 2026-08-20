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
});
