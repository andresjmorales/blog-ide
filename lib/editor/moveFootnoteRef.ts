import { Fragment, Slice, type Node as PMNode } from "@tiptap/pm/model";
import { TextSelection, type EditorState, type Transaction } from "@tiptap/pm/state";
import { dropPoint, insertPoint } from "@tiptap/pm/transform";
import type { EditorView } from "@tiptap/pm/view";

export type FootnoteRefRecord = {
  pos: number;
  size: number;
  id: string;
  content: string;
};

export type MoveFootnotePlan =
  | { ok: false; reason: "missing" | "invalid" | "noop" }
  | {
      ok: true;
      from: number;
      size: number;
      insertPos: number;
      mappedInsertPos: number;
      id: string;
      content: string;
    };

/** Surfaces that are not the essay body; dropping there must not move a note. */
export const BLOCKED_FOOTNOTE_DROP_SELECTOR = [
  ".footnote-pin",
  ".footnote-card",
  ".sidenote-rail",
  ".blogide-editor-toolbar",
  ".settings-overlay",
  ".footnote-ref-ghost",
  ".footnote-drop-caret",
].join(", ");

export function listFootnoteRefs(doc: PMNode): FootnoteRefRecord[] {
  const found: FootnoteRefRecord[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name !== "footnoteRef") return true;
    found.push({
      pos,
      size: node.nodeSize,
      id: String(node.attrs.id ?? ""),
      content: String(node.attrs.content ?? ""),
    });
    return true;
  });
  return found;
}

export function findFootnoteRefAt(
  doc: PMNode,
  pos: number
): FootnoteRefRecord | null {
  const node = doc.nodeAt(pos);
  if (!node || node.type.name !== "footnoteRef") return null;
  return {
    pos,
    size: node.nodeSize,
    id: String(node.attrs.id ?? ""),
    content: String(node.attrs.content ?? ""),
  };
}

/** 1-based display number of the footnote whose node starts at `pos`. */
export function footnoteNumberAt(doc: PMNode, pos: number): number | null {
  let number = 0;
  let found: number | null = null;
  doc.descendants((node, nodePos) => {
    if (node.type.name !== "footnoteRef") return true;
    number += 1;
    if (nodePos === pos) {
      found = number;
      return false;
    }
    return true;
  });
  return found;
}

export function isNoOpFootnoteMove(
  from: number,
  size: number,
  insertPos: number
): boolean {
  return insertPos === from || insertPos === from + size;
}

/** Where `insertPos` lands after deleting `[from, from + size)`. */
export function mappedInsertPosAfterDelete(
  from: number,
  size: number,
  insertPos: number
): number {
  return insertPos > from ? insertPos - size : insertPos;
}

export function isBlockedFootnoteDropTarget(
  target: EventTarget | null
): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest(BLOCKED_FOOTNOTE_DROP_SELECTOR));
}

/**
 * Valid place to insert a footnoteRef near `pos`, or null if the parent
 * cannot host one (code blocks, etc.). Does not walk out of a rejecting
 * textblock — that would silently drop beside the block instead of failing.
 */
export function resolveFootnoteInsertPos(
  doc: PMNode,
  pos: number
): number | null {
  const type = doc.type.schema.nodes.footnoteRef;
  if (!type) return null;
  if (!Number.isFinite(pos)) return null;
  const clamped = Math.max(0, Math.min(pos, doc.content.size));
  let $pos: ReturnType<PMNode["resolve"]>;
  try {
    $pos = doc.resolve(clamped);
  } catch {
    return null;
  }

  if ($pos.parent.canReplaceWith($pos.index(), $pos.index(), type)) {
    return clamped;
  }

  if ($pos.parent.isTextblock) return null;

  const point = insertPoint(doc, clamped, type);
  if (point != null) return point;

  const slice = new Slice(
    Fragment.from(type.create({ id: "drop", content: "" })),
    0,
    0
  );
  return dropPoint(doc, clamped, slice);
}

/**
 * If `pos` is on a footnote atom, choose before vs after from pointer x.
 */
export function snapAroundFootnoteAtom(
  doc: PMNode,
  pos: number,
  clientX: number,
  leftAt: (position: number) => number
): number {
  const clamped = Math.max(0, Math.min(pos, doc.content.size));
  let $pos: ReturnType<PMNode["resolve"]>;
  try {
    $pos = doc.resolve(clamped);
  } catch {
    return pos;
  }

  const after = $pos.nodeAfter;
  if (after?.type.name === "footnoteRef") {
    try {
      const left = leftAt($pos.pos);
      const right = leftAt($pos.pos + after.nodeSize);
      return clientX < (left + right) / 2
        ? $pos.pos
        : $pos.pos + after.nodeSize;
    } catch {
      return $pos.pos;
    }
  }

  const before = $pos.nodeBefore;
  if (before?.type.name === "footnoteRef") {
    const start = $pos.pos - before.nodeSize;
    try {
      const left = leftAt(start);
      const right = leftAt($pos.pos);
      return clientX < (left + right) / 2 ? start : $pos.pos;
    } catch {
      return $pos.pos;
    }
  }

  return pos;
}

export function planMoveFootnoteRef(
  doc: PMNode,
  from: number,
  to: number
): MoveFootnotePlan {
  const hit = findFootnoteRefAt(doc, from);
  if (!hit) return { ok: false, reason: "missing" };
  const insertPos = resolveFootnoteInsertPos(doc, to);
  if (insertPos == null) return { ok: false, reason: "invalid" };
  if (isNoOpFootnoteMove(hit.pos, hit.size, insertPos)) {
    return { ok: false, reason: "noop" };
  }
  return {
    ok: true,
    from: hit.pos,
    size: hit.size,
    insertPos,
    mappedInsertPos: mappedInsertPosAfterDelete(hit.pos, hit.size, insertPos),
    id: hit.id,
    content: hit.content,
  };
}

export function applyMoveFootnoteRef(
  state: EditorState,
  from: number,
  to: number,
  dispatch?: (tr: Transaction) => void
): boolean {
  const plan = planMoveFootnoteRef(state.doc, from, to);
  if (!plan.ok) return false;
  const node = state.doc.nodeAt(plan.from);
  if (!node || node.type.name !== "footnoteRef") return false;
  if (!dispatch) return true;

  const tr = state.tr.delete(plan.from, plan.from + plan.size);
  const mapped = tr.mapping.map(plan.insertPos);
  const $insert = tr.doc.resolve(mapped);
  if (
    !$insert.parent.canReplaceWith($insert.index(), $insert.index(), node.type)
  ) {
    return false;
  }
  tr.insert(mapped, node);
  const after = mapped + node.nodeSize;
  if (after <= tr.doc.content.size) {
    try {
      tr.setSelection(TextSelection.create(tr.doc, after));
    } catch {
      /* keep mapped selection */
    }
  }
  dispatch(tr);
  return true;
}

export function footnoteDropPosFromCoords(
  view: EditorView,
  clientX: number,
  clientY: number,
  hitTarget?: EventTarget | null
): number | null {
  const target =
    hitTarget ??
    (typeof document !== "undefined"
      ? document.elementFromPoint(clientX, clientY)
      : null);
  if (isBlockedFootnoteDropTarget(target)) return null;
  const coords = view.posAtCoords({ left: clientX, top: clientY });
  if (!coords) return null;
  let pos = coords.pos;
  if (coords.inside >= 0) {
    const inner = view.state.doc.nodeAt(coords.inside);
    if (inner?.type.name === "footnoteRef") {
      pos = coords.inside;
    }
  }
  pos = snapAroundFootnoteAtom(view.state.doc, pos, clientX, (at) => {
    return view.coordsAtPos(at).left;
  });
  return resolveFootnoteInsertPos(view.state.doc, pos);
}

export function caretCoordsAtPos(
  view: EditorView,
  pos: number
): { left: number; top: number; height: number } | null {
  try {
    const coords = view.coordsAtPos(pos);
    return {
      left: coords.left,
      top: coords.top,
      height: Math.max(coords.bottom - coords.top, 12),
    };
  } catch {
    return null;
  }
}
