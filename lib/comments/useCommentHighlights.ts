"use client";

import { useEffect } from "react";
import type { Editor } from "@tiptap/core";
import type { Transaction } from "@tiptap/pm/state";
import {
  COMMENT_THREAD_ATTR,
  mappedCommentRange,
  setCommentHighlights,
} from "@/lib/comments/highlights";
import {
  resolveFootnoteThreads,
  resolveThreads,
} from "@/lib/comments/resolveThreads";
import {
  getCommentSession,
  setThreadPlacements,
  useCommentSession,
} from "@/lib/comments/store";
import { footnoteIndexKey } from "@/lib/editor/footnoteNumbers";
import { openFootnoteCardNear } from "@/lib/editor/footnoteOpen";
import {
  coordsBox,
  findEditorScroller,
  scrollRectIntoScroller,
} from "@/lib/editor/editorScroll";
import {
  cancelEditorWork,
  EDITOR_WORK_MS,
  scheduleEditorWork,
} from "@/lib/editor/workSchedule";

const EMPTY_INPUT = { ranges: [], dots: [], activeThreadId: null };

function onDocChange(
  editor: Editor,
  schedule: () => void
): () => void {
  // Content swaps (refresh, remote fast-forward) use setContent without an
  // update event, so watch doc-changing transactions. This only resets a
  // timer; resolving runs on the after-typing lane.
  const handler = ({ transaction }: { transaction: Transaction }) => {
    if (!transaction.docChanged) return;
    if (getCommentSession().threads.length === 0) return;
    schedule();
  };
  editor.on("transaction", handler);
  return () => {
    editor.off("transaction", handler);
  };
}

/**
 * Paint the session's threads on an essay editor (owner or invitee) and
 * keep placements (document order, detached) current for the rail.
 */
export function useCommentHighlights(editor: Editor | null, enabled = true): void {
  const { threads, activeThreadId, revealNonce } = useCommentSession();

  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    const workId = "commentAnchors";
    const run = () => {
      if (editor.isDestroyed) return;
      const session = getCommentSession();
      if (!enabled || session.threads.length === 0) {
        setCommentHighlights(editor, EMPTY_INPUT);
        if (enabled) setThreadPlacements({});
        return;
      }
      const result = resolveThreads(
        editor.state.doc,
        session.threads,
        session.activeThreadId,
        footnoteIndexKey.getState(editor.state)
      );
      setThreadPlacements(result.placements);
      setCommentHighlights(editor, result.highlights);
    };
    run();
    const off = onDocChange(editor, () =>
      scheduleEditorWork(workId, EDITOR_WORK_MS.commentAnchors, run)
    );
    return () => {
      off();
      cancelEditorWork(workId);
    };
  }, [editor, enabled, threads, activeThreadId]);

  // The rail asked to show a thread: scroll to its highlight, or open the
  // footnote it lives in.
  useEffect(() => {
    if (!editor || revealNonce === 0 || editor.isDestroyed) return;
    const session = getCommentSession();
    const thread = session.threads.find((t) => t.id === session.activeThreadId);
    if (!thread) return;
    const anchor = thread.root.anchor;
    requestAnimationFrame(() => {
      if (editor.isDestroyed) return;
      const scroller = findEditorScroller(editor);
      if (anchor.scope === "footnote" && anchor.footnoteId) {
        const refEl = editor.view.dom.querySelector(
          `[data-footnote-id="${CSS.escape(anchor.footnoteId)}"]`
        );
        if (scroller && refEl instanceof HTMLElement) {
          const rect = refEl.getBoundingClientRect();
          scrollRectIntoScroller(scroller, { top: rect.top, height: rect.height });
        }
        requestAnimationFrame(() => {
          openFootnoteCardNear(anchor.footnoteId!, null);
        });
        return;
      }
      const range = mappedCommentRange(editor, thread.id);
      if (!range || !scroller) return;
      const box = coordsBox(editor, range.from, range.to);
      if (box) scrollRectIntoScroller(scroller, box);
    });
  }, [editor, revealNonce]);
}

/** Highlights inside one open footnote card's nested editor. */
export function useFootnoteCommentHighlights(
  noteEditor: Editor | null,
  footnoteId: string
): void {
  const { threads, activeThreadId, revealNonce } = useCommentSession();
  const hasThreads = threads.some(
    (t) => t.root.anchor.scope === "footnote" && t.root.anchor.footnoteId === footnoteId
  );

  useEffect(() => {
    if (!noteEditor || noteEditor.isDestroyed) return;
    const workId = `commentAnchors:${footnoteId}`;
    const run = () => {
      if (noteEditor.isDestroyed) return;
      const session = getCommentSession();
      setCommentHighlights(
        noteEditor,
        resolveFootnoteThreads(
          noteEditor.state.doc,
          footnoteId,
          session.threads,
          session.activeThreadId
        )
      );
    };
    run();
    if (!hasThreads) return;
    const off = onDocChange(noteEditor, () =>
      scheduleEditorWork(workId, EDITOR_WORK_MS.commentAnchors, run)
    );
    return () => {
      off();
      cancelEditorWork(workId);
    };
  }, [noteEditor, footnoteId, hasThreads, threads, activeThreadId]);

  useEffect(() => {
    if (!noteEditor || revealNonce === 0) return;
    const session = getCommentSession();
    const thread = session.threads.find((t) => t.id === session.activeThreadId);
    if (thread?.root.anchor.footnoteId !== footnoteId) return;
    const frame = requestAnimationFrame(() => {
      if (noteEditor.isDestroyed) return;
      const el = noteEditor.view.dom.querySelector(
        `[${COMMENT_THREAD_ATTR}="${CSS.escape(thread.id)}"]`
      );
      if (el instanceof HTMLElement) el.scrollIntoView({ block: "nearest" });
    });
    return () => cancelAnimationFrame(frame);
  }, [noteEditor, footnoteId, revealNonce]);
}
