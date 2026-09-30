import type { Editor } from "@tiptap/core";
import { createAnchor, type CommentAnchor } from "@/lib/comments/anchors";

/**
 * Editors text can be commented on from: the essay body and each open
 * footnote card. Selection helpers find which one holds the selection.
 */

type Surface = { editor: Editor; footnoteId: string | null };

const surfaces = new Set<Surface>();

export function registerCommentSurface(
  editor: Editor,
  footnoteId: string | null
): () => void {
  const surface = { editor, footnoteId };
  surfaces.add(surface);
  return () => {
    surfaces.delete(surface);
  };
}

export type SelectionTarget = {
  surface: Surface;
  from: number;
  to: number;
  rect: DOMRect;
};

/** The live DOM selection, if it sits inside one registered editor. */
export function currentCommentSelection(): SelectionTarget | null {
  if (typeof window === "undefined") return null;
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
    return null;
  }
  const { anchorNode, focusNode } = selection;
  if (!anchorNode || !focusNode) return null;
  for (const surface of surfaces) {
    const { editor } = surface;
    if (editor.isDestroyed) continue;
    const dom = editor.view.dom;
    if (!dom.contains(anchorNode) || !dom.contains(focusNode)) continue;
    try {
      const a = editor.view.posAtDOM(anchorNode, selection.anchorOffset);
      const b = editor.view.posAtDOM(focusNode, selection.focusOffset);
      if (a === b) return null;
      const rect = selection.getRangeAt(0).getBoundingClientRect();
      return { surface, from: Math.min(a, b), to: Math.max(a, b), rect };
    } catch {
      return null;
    }
  }
  return null;
}

/** Anchor for a selection target, or null when it holds no text. */
export function anchorForSelection(target: SelectionTarget): CommentAnchor | null {
  const { editor, footnoteId } = target.surface;
  return createAnchor(
    editor.state.doc,
    target.from,
    target.to,
    footnoteId ? "footnote" : "body",
    footnoteId ?? undefined
  );
}

/** Test helper. */
export function clearCommentSurfaces(): void {
  surfaces.clear();
}
