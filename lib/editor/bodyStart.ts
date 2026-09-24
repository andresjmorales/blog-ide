import type { Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Selection, TextSelection } from "@tiptap/pm/state";

/** Blocks that count as "regular text" for the default caret. */
const BODY_TEXT_BLOCKS = new Set(["paragraph", "heading"]);

/**
 * Caret position at the start of the first paragraph or heading, or null
 * when the body has none. A leading image or divider is skipped so opening
 * an essay does not select it (which opens the image's alt-text field).
 */
export function bodyStartPos(doc: ProseMirrorNode): number | null {
  let found: number | null = null;
  doc.descendants((node, pos) => {
    if (found !== null) return false;
    if (node.isTextblock) {
      if (BODY_TEXT_BLOCKS.has(node.type.name)) found = pos + 1;
      return false;
    }
    return true;
  });
  return found;
}

/** Default body selection: first regular text, else ProseMirror's start. */
export function bodyStartSelection(doc: ProseMirrorNode): Selection {
  const pos = bodyStartPos(doc);
  return pos === null ? Selection.atStart(doc) : TextSelection.create(doc, pos);
}

/**
 * Park the caret at the body's first regular text without focusing or
 * scrolling, and without an undo step. Used after a document loads.
 */
export function placeCaretAtBodyStart(editor: Editor): void {
  if (editor.isDestroyed || editor.isFocused) return;
  const { state } = editor;
  const selection = bodyStartSelection(state.doc);
  if (selection.eq(state.selection)) return;
  editor.view.dispatch(
    state.tr.setSelection(selection).setMeta("addToHistory", false)
  );
}
