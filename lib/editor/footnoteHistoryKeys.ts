import type { Editor } from "@tiptap/core";

export type FootnoteHistoryAction = "undo" | "redo";

/** Ctrl/Cmd+Z, Shift+Z, or Y — same chords TipTap's undo-redo extension uses. */
export function footnoteHistoryAction(
  event: KeyboardEvent
): FootnoteHistoryAction | null {
  if (!(event.metaKey || event.ctrlKey) || event.altKey) return null;
  const key = event.key.toLowerCase();
  if (key === "z" || key === "я") {
    return event.shiftKey ? "redo" : "undo";
  }
  if (key === "y") return "redo";
  return null;
}

/**
 * Apply undo/redo to the nested footnote editor and swallow the event so the
 * essay editor never receives it. Capture-phase callers should use this when
 * the event target is inside this footnote's card.
 */
export function applyFootnoteHistoryKey(
  editor: Editor,
  action: FootnoteHistoryAction
): boolean {
  if (editor.isDestroyed) return false;
  if (action === "undo") {
    if (editor.commands.undoInputRule()) return true;
    return editor.commands.undo();
  }
  return editor.commands.redo();
}

export function isFootnoteHistoryTarget(
  target: EventTarget | null,
  footnoteId: string
): boolean {
  if (!(target instanceof Element)) return false;
  if (target.closest("input, textarea, select")) return false;
  const owner = target
    .closest(".footnote-pin, .footnote-card")
    ?.getAttribute("data-footnote-id");
  return owner === footnoteId;
}
