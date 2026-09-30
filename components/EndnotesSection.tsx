"use client";

import { memo, useId, useMemo } from "react";
import type { Editor } from "@tiptap/core";
import { useEditorState } from "@tiptap/react";
import { footnoteHtml } from "@/components/FootnoteSidenote";
import {
  collectRailNotes,
  footnoteIndexKey,
  railNotesEqual,
  type RailNote,
} from "@/lib/editor/footnoteNumbers";
import { openFootnoteCardNear } from "@/lib/editor/footnoteOpen";
import { findEditorScroller, scrollRectIntoScroller } from "@/lib/editor/editorScroll";
import { useCommentSessionValue } from "@/lib/comments/store";
import type { CommentThread } from "@/lib/comments/types";

type Props = {
  editor: Editor;
  expanded: boolean;
  onExpandedChange: (next: boolean) => void;
};

function footnoteRefEl(editor: Editor, id: string): HTMLElement | null {
  return editor.view.dom.querySelector<HTMLElement>(
    `[data-footnote-id="${CSS.escape(id)}"] .footnote-ref`
  );
}

/** Back-link: bring the superscript into view and flash it. */
function scrollToReference(editor: Editor, id: string) {
  const ref = footnoteRefEl(editor, id);
  if (!ref) return;
  const scroller = findEditorScroller(editor);
  const rect = ref.getBoundingClientRect();
  if (scroller) {
    scrollRectIntoScroller(scroller, { top: rect.top, height: rect.height });
  } else {
    ref.scrollIntoView({ block: "center" });
  }
  ref.classList.remove("is-flashing");
  // Restart the animation when the same note is picked twice.
  void ref.offsetWidth;
  ref.classList.add("is-flashing");
  window.setTimeout(() => ref.classList.remove("is-flashing"), 1400);
}

function commentedFootnoteIds(threads: CommentThread[]): Set<string> {
  const ids = new Set<string>();
  for (const thread of threads) {
    const anchor = thread.root.anchor;
    if (thread.root.status === "open" && anchor.scope === "footnote" && anchor.footnoteId) {
      ids.add(anchor.footnoteId);
    }
  }
  return ids;
}

const Endnote = memo(function Endnote({
  editor,
  note,
  commented,
}: {
  editor: Editor;
  note: RailNote;
  commented: boolean;
}) {
  const html = useMemo(() => footnoteHtml(note.content), [note.content]);
  const readOnly = !editor.isEditable;
  return (
    <li className="endnote" data-endnote-id={note.id}>
      <button
        type="button"
        className={`endnote-number${commented ? " has-comment-thread" : ""}`}
        title="Back to the reference in the text"
        aria-label={`Footnote ${note.number}: back to the reference`}
        onClick={() => scrollToReference(editor, note.id)}
      >
        {note.number}
      </button>
      <div
        role="button"
        tabIndex={0}
        className={`endnote-body${html ? "" : " is-empty"}`}
        title={readOnly ? "Open footnote" : "Edit footnote"}
        aria-label={`${readOnly ? "Open" : "Edit"} footnote ${note.number}`}
        onClick={(event) => {
          event.preventDefault();
          openFootnoteCardNear(note.id, event.currentTarget);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            openFootnoteCardNear(note.id, event.currentTarget);
          }
        }}
      >
        {html ? <span dangerouslySetInnerHTML={{ __html: html }} /> : "Empty footnote"}
      </div>
      <button
        type="button"
        className="endnote-backlink"
        title="Back to the reference in the text"
        aria-label={`Back to reference ${note.number}`}
        onClick={() => scrollToReference(editor, note.id)}
      >
        ↩
      </button>
    </li>
  );
});

/**
 * Footnotes listed after the essay, scrolling with it (not a fixed-height
 * rail). Collapsed, it renders only the header, so a long notes list costs
 * nothing while you write. Numbers link back to each reference; a note's
 * text opens its card (editable for the owner, read-only for invitees).
 */
export function EndnotesSection({ editor, expanded, onExpandedChange }: Props) {
  const listId = useId();
  // Same source as the margin rail: plugin state, reused while typing in
  // the body (no document walk per keystroke).
  const notes = useEditorState({
    editor,
    selector: ({ editor: current }) =>
      footnoteIndexKey.getState(current.state)?.notes ??
      collectRailNotes(current.state.doc),
    equalityFn: railNotesEqual,
  });
  const threads = useCommentSessionValue((s) => s.threads);
  const commented = useMemo(() => commentedFootnoteIds(threads), [threads]);

  if (!notes || notes.length === 0) return null;

  return (
    <section className="endnotes" aria-label="Notes" contentEditable={false}>
      <button
        type="button"
        className="endnotes-toggle"
        aria-expanded={expanded}
        aria-controls={listId}
        onClick={() => onExpandedChange(!expanded)}
      >
        <span aria-hidden className="endnotes-caret">
          {expanded ? "▾" : "▸"}
        </span>
        Notes ({notes.length})
      </button>
      {expanded && (
        <ol id={listId} className="endnotes-list">
          {notes.map((note) => (
            <Endnote
              key={note.id || `n-${note.number}`}
              editor={editor}
              note={note}
              commented={commented.has(note.id)}
            />
          ))}
        </ol>
      )}
    </section>
  );
}
