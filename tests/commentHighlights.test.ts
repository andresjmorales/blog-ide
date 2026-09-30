import { afterEach, describe, expect, it, vi } from "vitest";
import { Editor } from "@tiptap/core";
import { createExtensions } from "@/lib/editor/extensions";
import { parseBody, serializeBody } from "@/lib/markdown/pipeline";
import {
  CommentHighlights,
  commentHighlightsKey,
  mappedCommentRange,
  setCommentHighlights,
} from "@/lib/comments/highlights";
import { createAnchor, projectText } from "@/lib/comments/anchors";
import * as anchors from "@/lib/comments/anchors";
import { resolveThreads } from "@/lib/comments/resolveThreads";
import { footnoteDocFromMarkdown } from "@/lib/comments/footnoteText";
import {
  sortThreadsByPlacement,
  type CommentThread,
} from "@/lib/comments/types";
import type { CommentAnchor } from "@/lib/comments/anchors";
import { footnoteIndexKey } from "@/lib/editor/footnoteNumbers";
import { resetEditorWorkSchedule } from "@/lib/editor/workSchedule";

const ESSAY =
  "Opening line about gardens.[[blogide-fn:n1:A_20note_20on_20roses_20and_20tulips.]]\n\nSecond paragraph mentions gardens again.\n";

function makeEditor(body = ESSAY) {
  return new Editor({
    extensions: [
      ...createExtensions(),
      CommentHighlights.configure({ onActivate: null }),
    ],
    content: parseBody(body),
  });
}

function thread(id: string, anchor: CommentAnchor, status = "open"): CommentThread {
  const row = {
    id,
    thread_id: null,
    author_id: "u1",
    author_name: "Gloria",
    kind: "comment" as const,
    anchor,
    body: "hi",
    status: status as "open",
    created_at: "2026-09-30T00:00:00Z",
    updated_at: "2026-09-30T00:00:00Z",
    resolved_at: null,
    resolved_by: null,
  };
  return { id, root: row, replies: [] };
}

function bodyAnchor(editor: Editor, needle: string, nth = 0): CommentAnchor {
  const { text, segments } = projectText(editor.state.doc);
  let at = -1;
  for (let i = 0; i <= nth; i++) at = text.indexOf(needle, at + 1);
  const seg = segments.find((s) => at >= s.start && at < s.start + s.length)!;
  const from = seg.pos + (at - seg.start);
  return createAnchor(editor.state.doc, from, from + needle.length)!;
}

describe("comment highlights", () => {
  afterEach(() => {
    resetEditorWorkSchedule();
    vi.restoreAllMocks();
  });

  it("paints decorations without touching markdown", () => {
    const editor = makeEditor();
    try {
      const before = serializeBody(editor.getJSON());
      const threads = [thread("t1", bodyAnchor(editor, "gardens", 1))];
      const result = resolveThreads(editor.state.doc, threads, "t1");
      expect(setCommentHighlights(editor, result.highlights)).toBe(true);
      // Same input again: no transaction.
      expect(setCommentHighlights(editor, result.highlights)).toBe(false);
      const dom = editor.view.dom as HTMLElement;
      const painted = dom.querySelector('[data-comment-thread="t1"]');
      expect(painted?.textContent).toBe("gardens");
      expect(painted?.classList.contains("is-active")).toBe(true);
      expect(serializeBody(editor.getJSON())).toBe(before);
    } finally {
      editor.destroy();
    }
  });

  it("maps highlights through typing without re-resolving", () => {
    const editor = makeEditor();
    try {
      const threads = [thread("t1", bodyAnchor(editor, "gardens", 1))];
      setCommentHighlights(
        editor,
        resolveThreads(editor.state.doc, threads, null).highlights
      );
      const range = mappedCommentRange(editor, "t1")!;
      const spy = vi.spyOn(anchors, "resolveAnchor");
      editor.view.dispatch(editor.state.tr.insertText("Very ", 1));
      expect(spy).not.toHaveBeenCalled();
      const mapped = mappedCommentRange(editor, "t1")!;
      expect(mapped.from).toBe(range.from + 5);
      expect(editor.state.doc.textBetween(mapped.from, mapped.to)).toBe("gardens");
    } finally {
      editor.destroy();
    }
  });

  it("marks footnote references and orders threads in document order", () => {
    const editor = makeEditor();
    try {
      const noteDoc = footnoteDocFromMarkdown("A note on roses and tulips.");
      const { text, segments } = projectText(noteDoc);
      const at = text.indexOf("tulips");
      const from = segments[0].pos + at;
      const fnAnchor = createAnchor(noteDoc, from, from + 6, "footnote", "n1")!;
      const threads = [
        thread("second", bodyAnchor(editor, "Second paragraph")),
        thread("gone", {
          scope: "body",
          quote: "sentence that was deleted",
          prefix: "",
          suffix: "",
          hint: 3,
        }),
        thread("note", fnAnchor),
        thread("first", bodyAnchor(editor, "Opening")),
      ];
      const result = resolveThreads(
        editor.state.doc,
        threads,
        null,
        footnoteIndexKey.getState(editor.state)
      );
      expect(result.placements.gone.detached).toBe(true);
      expect(result.placements.note).toMatchObject({
        detached: false,
        footnoteNumber: 1,
      });
      expect(result.highlights.dots).toHaveLength(1);
      expect(result.highlights.dots[0].threadIds).toEqual(["note"]);
      const order = sortThreadsByPlacement(threads, result.placements).map(
        (t) => t.id
      );
      expect(order).toEqual(["first", "note", "second", "gone"]);

      setCommentHighlights(editor, result.highlights);
      const dom = editor.view.dom as HTMLElement;
      expect(dom.querySelector(".has-comment-thread")).not.toBeNull();
    } finally {
      editor.destroy();
    }
  });

  it("does not paint resolved threads but keeps their placement", () => {
    const editor = makeEditor();
    try {
      const threads = [thread("done", bodyAnchor(editor, "Opening"), "resolved")];
      const result = resolveThreads(editor.state.doc, threads, null);
      expect(result.highlights.ranges).toHaveLength(0);
      expect(result.placements.done.detached).toBe(false);
    } finally {
      editor.destroy();
    }
  });

  it("stays out of undo history", () => {
    const editor = makeEditor();
    try {
      const threads = [thread("t1", bodyAnchor(editor, "Opening"))];
      setCommentHighlights(
        editor,
        resolveThreads(editor.state.doc, threads, null).highlights
      );
      expect(editor.can().undo()).toBe(false);
      expect(commentHighlightsKey.getState(editor.state)?.ranges).toHaveLength(1);
    } finally {
      editor.destroy();
    }
  });
});
