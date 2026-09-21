import { afterEach, describe, expect, it, vi } from "vitest";
import { Editor } from "@tiptap/core";
import { createExtensions } from "@/lib/editor/extensions";
import { parseBody } from "@/lib/markdown/pipeline";
import { transactionTouchesNodeType } from "@/lib/editor/changedRange";
import {
  footnoteIndexKey,
  collectRailNotes,
} from "@/lib/editor/footnoteNumbers";
import { resetEditorWorkSchedule } from "@/lib/editor/workSchedule";
import { setFindHighlights } from "@/lib/editor/findHighlight";
import { findInEditor } from "@/lib/editor/findReplaceInEditor";
import { BIBLE_SCAN_RADIUS } from "@/lib/bible/hits";
import * as bibleDetect from "@/lib/bible/detect";
import {
  BibleRefHighlight,
  getBibleRefState,
} from "@/lib/editor/bible/BibleRefHighlight";

function makeEditor(body: string) {
  return new Editor({
    extensions: createExtensions(),
    content: parseBody(body),
  });
}

describe("editor hot path", () => {
  afterEach(() => {
    resetEditorWorkSchedule();
    vi.useRealTimers();
  });

  it("does not treat body typing as a footnote edit", () => {
    const editor = makeEditor("Hello.[^1]\n\n[^1]: a note\n");
    try {
      const before = editor.state;
      const insert = before.tr.insertText("y", 2);
      expect(
        transactionTouchesNodeType(
          insert,
          before.doc,
          insert.doc,
          "footnoteRef"
        )
      ).toBe(false);
    } finally {
      editor.destroy();
    }
  });

  it("detects inserting or deleting a footnote atom", () => {
    const editor = makeEditor("Hello.[^1]\n\n[^1]: a note\n");
    try {
      let footnotePos = -1;
      editor.state.doc.descendants((node, pos) => {
        if (node.type.name === "footnoteRef") {
          footnotePos = pos;
          return false;
        }
      });
      expect(footnotePos).toBeGreaterThan(0);
      const before = editor.state;
      const deleted = before.tr.delete(footnotePos, footnotePos + 1);
      expect(
        transactionTouchesNodeType(
          deleted,
          before.doc,
          deleted.doc,
          "footnoteRef"
        )
      ).toBe(true);
    } finally {
      editor.destroy();
    }
  });

  it("reuses the footnote index when typing in the body", () => {
    const editor = makeEditor("Hello.[^1] World.[^2]\n\n[^1]: one\n\n[^2]: two\n");
    try {
      const before = footnoteIndexKey.getState(editor.state);
      expect(before?.notes).toHaveLength(2);
      editor.commands.insertContentAt(1, "x");
      const after = footnoteIndexKey.getState(editor.state);
      expect(after).toBe(before);
      expect(collectRailNotes(editor.state.doc)).toHaveLength(2);
    } finally {
      editor.destroy();
    }
  });

  it("rebuilds the footnote index when a note body attr changes", () => {
    const editor = makeEditor("Hello.[^1]\n\n[^1]: one\n");
    try {
      const before = footnoteIndexKey.getState(editor.state);
      let footnotePos = -1;
      editor.state.doc.descendants((node, pos) => {
        if (node.type.name === "footnoteRef") {
          footnotePos = pos;
          return false;
        }
      });
      const node = editor.state.doc.nodeAt(footnotePos);
      editor.view.dispatch(
        editor.state.tr.setNodeMarkup(footnotePos, undefined, {
          ...node!.attrs,
          content: "updated",
        })
      );
      const after = footnoteIndexKey.getState(editor.state);
      expect(after).not.toBe(before);
      expect(after?.notes[0]?.content).toBe("updated");
    } finally {
      editor.destroy();
    }
  });

  it("does not prune citations on the same tick as body typing", () => {
    vi.useFakeTimers();
    const citation = {
      id: "CARET1",
      provider: "bibtex" as const,
      citeKey: "caret",
      title: "Caret source",
      formatted: { "chicago-note": "UniqueCaretToken (2024)." },
    };
    const editor = makeEditor("See UniqueCaretToken (2024).\n");
    try {
      editor.view.dispatch(
        editor.state.tr.setDocAttribute("essayCitations", [citation])
      );
      let extra = 0;
      editor.on("transaction", ({ transaction }) => {
        if (transaction.getMeta("blogide-skip-footnote-delete")) extra += 1;
      });
      editor.commands.insertContentAt(1, "x");
      expect(extra).toBe(0);
      expect(editor.state.doc.attrs.essayCitations).toEqual([citation]);
    } finally {
      editor.destroy();
    }
  });

  it("does not scan the whole paragraph for bible refs while typing", () => {
    const filler = "See item 12 and note 3 in chapter 4 of the argument. ";
    const gap = "abcd ".repeat(31);
    const body = `See John 3:16 today. ${filler.repeat(200)}Luke 2:10 ${gap}CARET${filler.repeat(200)} See Romans 8:28 today.[^1]\n\n[^1]: a note\n`;
    const element = document.createElement("div");
    document.body.appendChild(element);
    const editor = new Editor({
      element,
      extensions: [...createExtensions(), BibleRefHighlight],
      content: parseBody(body),
    });
    const spy = vi.spyOn(bibleDetect, "detectEnglishBibleRefs");
    try {
      editor.commands.setBibleRefsEnabled(true);
      expect(getBibleRefState(editor).hits.map((hit) => hit.text)).toEqual(
        expect.arrayContaining(["John 3:16", "Luke 2:10", "Romans 8:28"])
      );
      const index = footnoteIndexKey.getState(editor.state);
      let caret = -1;
      editor.state.doc.descendants((node, pos) => {
        if (!node.isText || !node.text) return;
        const at = node.text.indexOf("CARET");
        if (at < 0) return;
        caret = pos + at;
        return false;
      });
      expect(caret).toBeGreaterThan(BIBLE_SCAN_RADIUS);
      spy.mockClear();
      editor.commands.insertContentAt(caret, "x");
      expect(footnoteIndexKey.getState(editor.state)).toBe(index);
      expect(spy.mock.calls.length).toBeGreaterThan(0);
      for (const [text] of spy.mock.calls) {
        expect(text.length).toBeLessThanOrEqual(BIBLE_SCAN_RADIUS * 2 + 2);
      }
      expect(getBibleRefState(editor).hits.map((hit) => hit.text)).toEqual(
        expect.arrayContaining(["John 3:16", "Luke 2:10", "Romans 8:28"])
      );

      editor.commands.insertContentAt(caret, "Acts 2:38 ");
      expect(getBibleRefState(editor).hits.map((hit) => hit.text)).toEqual(
        expect.arrayContaining([
          "John 3:16",
          "Luke 2:10",
          "Acts 2:38",
          "Romans 8:28",
        ])
      );
    } finally {
      spy.mockRestore();
      editor.destroy();
    }
  });

  it("keeps find highlights mapped after a body edit", () => {
    const editor = makeEditor("alpha beta alpha\n");
    try {
      const matches = findInEditor(
        editor,
        { query: "alpha", regex: false, caseSensitive: false },
        "document"
      );
      expect(matches).toHaveLength(2);
      setFindHighlights(editor, matches, 0, null);
      editor.commands.insertContentAt(6, "X");
      expect(editor.state.doc.textContent).toContain("X");
    } finally {
      editor.destroy();
    }
  });
});
