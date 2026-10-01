"use client";

import { memo, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import type { Editor } from "@tiptap/core";
import { useEditorState } from "@tiptap/react";
import { footnoteHtml } from "@/components/FootnoteSidenote";
import { FootnoteNoteEditor } from "@/components/FootnoteNoteEditor";
import { useEditorPrefs } from "@/components/EditorPrefsContext";
import { useEssaySpellcheck } from "@/components/EssaySpellcheckContext";
import { isFootnoteOutsidePointerTarget } from "@/lib/editor/footnoteCard";
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

/**
 * The note's body, edited right in the list (same nested schema as the card:
 * no headings, images, or nested footnotes). Escape or a click elsewhere
 * commits and returns to the rendered note.
 */
function EndnoteInlineEditor({
  editor,
  note,
  onDone,
}: {
  editor: Editor;
  note: RailNote;
  onDone: () => void;
}) {
  const { prefs } = useEditorPrefs();
  const spellLang = useEssaySpellcheck().lang;
  const rootRef = useRef<HTMLDivElement | null>(null);
  const pendingFocusRef = useRef(true);
  const commitRef = useRef<(() => void) | null>(null);
  const dragSuppressUntilRef = useRef(0);
  const noteId = note.id;

  const updateAttributes = useCallback(
    ({ content }: { content: string }) => {
      if (editor.isDestroyed) return;
      editor.commands.updateFootnoteContent(noteId, content);
    },
    [editor, noteId]
  );

  const finish = useCallback(() => {
    commitRef.current?.();
    onDone();
  }, [onDone]);

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      const target = event.target;
      if (target instanceof globalThis.Node && rootRef.current?.contains(target)) {
        return;
      }
      if (isFootnoteOutsidePointerTarget(target, noteId)) finish();
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      const target = event.target;
      if (!(target instanceof globalThis.Node) || !rootRef.current?.contains(target)) {
        return;
      }
      event.preventDefault();
      finish();
    }
    // Deferred so the click that opened the editor cannot close it.
    const timer = window.setTimeout(() => {
      document.addEventListener("pointerdown", onPointerDown);
    }, 0);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [finish, noteId]);

  return (
    <div
      ref={rootRef}
      className="endnote-editor"
      data-footnote-id={noteId}
    >
      <FootnoteNoteEditor
        content={note.content}
        number={note.number}
        footnoteId={noteId}
        typography={prefs.typography}
        spellLang={spellLang}
        updateAttributes={updateAttributes}
        isFindTarget={false}
        findSession={null}
        pendingFocusRef={pendingFocusRef}
        commitRef={commitRef}
        dragSuppressUntilRef={dragSuppressUntilRef}
      />
    </div>
  );
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
  const [editing, setEditing] = useState(false);
  const stopEditing = useCallback(() => setEditing(false), []);

  /** Owners edit in place; invitees open the read-only card. */
  function activate(anchor: HTMLElement) {
    if (readOnly) {
      openFootnoteCardNear(note.id, anchor);
      return;
    }
    setEditing(true);
  }

  return (
    <li
      className={`endnote${editing ? " is-editing" : ""}`}
      data-endnote-id={note.id}
    >
      <button
        type="button"
        className={`endnote-number${commented ? " has-comment-thread" : ""}`}
        title="Back to the reference in the text"
        aria-label={`Footnote ${note.number}: back to the reference`}
        onClick={() => scrollToReference(editor, note.id)}
      >
        {note.number}
      </button>
      {editing && !readOnly ? (
        <EndnoteInlineEditor editor={editor} note={note} onDone={stopEditing} />
      ) : (
        <div
          role="button"
          tabIndex={0}
          className={`endnote-body${html ? "" : " is-empty"}`}
          title={readOnly ? "Open footnote" : "Edit footnote"}
          aria-label={`${readOnly ? "Open" : "Edit"} footnote ${note.number}`}
          onClick={(event) => {
            event.preventDefault();
            activate(event.currentTarget);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              activate(event.currentTarget);
            }
          }}
        >
          {html ? <span dangerouslySetInnerHTML={{ __html: html }} /> : "Empty footnote"}
        </div>
      )}
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
 * nothing while you write. Numbers link back to each reference; clicking a
 * note's text edits it in place (invitees get the read-only card instead).
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
