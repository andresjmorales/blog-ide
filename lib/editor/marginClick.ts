import type { Editor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";

/**
 * Google Docs-style margin clicks: a click in the empty page area beside the
 * text lands at the start / end of that visual line; below the essay, at the
 * end. Returns true when it placed the cursor (caller prevents default).
 */
export function placeCursorFromMargin(
  editor: Editor,
  event: { clientX: number; clientY: number; shiftKey: boolean }
): boolean {
  if (editor.isDestroyed || !editor.isEditable) return false;
  const view = editor.view;
  const rect = view.dom.getBoundingClientRect();
  if (rect.width === 0 || event.clientY < rect.top) return false;

  let pos: number | null = null;
  if (event.clientY > rect.bottom) {
    pos = TextSelection.atEnd(view.state.doc).from;
  } else {
    // Probe just inside the text column on the clicked row.
    const x =
      event.clientX < rect.left
        ? rect.left + 2
        : event.clientX > rect.right
          ? rect.right - 2
          : event.clientX;
    const hit = view.posAtCoords({ left: x, top: event.clientY });
    if (!hit) return false;
    pos = hit.pos;
  }

  const { doc } = view.state;
  const $pos = doc.resolve(pos);
  // Only textblocks take a caret; images / math atoms keep their own click.
  if (!$pos.parent.inlineContent) return false;
  const anchor = event.shiftKey ? view.state.selection.anchor : pos;
  view.dispatch(
    view.state.tr
      .setSelection(TextSelection.create(doc, anchor, pos))
      .scrollIntoView()
  );
  view.focus();
  return true;
}
