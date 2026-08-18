/**
 * Display-text vs href helpers for the Docs-style link bubble.
 */

import { getMarkRange, type Editor } from "@tiptap/core";
import type { EditorState } from "@tiptap/pm/state";

export function looksLikeHref(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  return /^(https?:\/\/|www\.|mailto:)/i.test(t);
}

/**
 * True when the visible text is the URL itself (pasted / autolinked), not a
 * named label like `[Example](https://example.com)`.
 */
export function isNakedLink(
  displayText: string,
  href: string | undefined
): boolean {
  const text = displayText.trim();
  const url = (href ?? "").trim();
  if (!text || !url) return false;
  if (text === url) return true;
  const strip = (value: string) =>
    value.replace(/^https?:\/\//i, "").replace(/\/$/, "");
  if (strip(text) === strip(url)) return true;
  return looksLikeHref(text);
}

export function getLinkMarkRangeFromState(
  state: EditorState
): { from: number; to: number } | null {
  const type = state.schema.marks.link;
  if (!type) return null;
  const { $from, $to, from, to, empty } = state.selection;
  const range = getMarkRange($from, type) ?? getMarkRange($to, type);
  if (range) return { from: range.from, to: range.to };
  if (!empty) return { from, to };
  return null;
}

export function getLinkMarkRange(
  editor: Editor
): { from: number; to: number } | null {
  return getLinkMarkRangeFromState(editor.state);
}

export function readLinkDisplayText(editor: Editor): string {
  const range = getLinkMarkRange(editor);
  if (!range) return "";
  return editor.state.doc.textBetween(range.from, range.to);
}

export type LinkEditorFocusField = "url" | "text";

/**
 * Ctrl+K / toolbar: named links and selected prose focus the URL field;
 * a naked (pasted) URL focuses the display-text field so it can be labeled.
 */
export function resolveLinkShortcutFocusField(
  editor: Editor
): LinkEditorFocusField {
  const href = editor.getAttributes("link").href as string | undefined;
  if (href?.trim() && isNakedLink(readLinkDisplayText(editor), href)) {
    return "text";
  }
  return "url";
}

/**
 * Set href and/or replace the visible link text. Does not focus the editor
 * (Enter-from-bubble must not land in ProseMirror).
 */
export function applyLinkHrefAndText(
  editor: Editor,
  href: string,
  displayText: string
): boolean {
  if (editor.isDestroyed) return false;
  const url = href.trim();
  const type = editor.schema.marks.link;
  if (!type) return false;

  if (!url) {
    if (editor.isActive("link")) {
      editor.chain().extendMarkRange("link").unsetLink().run();
    }
    return true;
  }

  const nextText = displayText.trim() || url;
  return editor.commands.command(({ tr, state, dispatch }) => {
    if (!dispatch) return true;
    const range = getLinkMarkRangeFromState(state);
    const from = range?.from ?? state.selection.from;
    const to = range?.to ?? state.selection.to;
    const current = from < to ? state.doc.textBetween(from, to) : "";
    const linkMark = type.create({ href: url });
    const extraMarks =
      from < to
        ? state.doc
            .resolve(from + 1 <= to ? from + 1 : from)
            .marks()
            .filter((mark) => mark.type !== type)
        : (state.storedMarks ?? state.selection.$from.marks()).filter(
            (mark) => mark.type !== type
          );

    if (from === to) {
      tr.insertText(nextText, from);
    } else if (current !== nextText) {
      tr.insertText(nextText, from, to);
    }

    const markTo =
      current === nextText && from !== to ? to : from + nextText.length;
    tr.addMark(from, markTo, linkMark);
    for (const mark of extraMarks) {
      tr.addMark(from, markTo, mark);
    }
    const stored = (
      tr.storedMarks ?? tr.selection.$from.marks()
    ).filter((mark) => mark.type !== type);
    tr.setStoredMarks(stored);
    dispatch(tr);
    return true;
  });
}
