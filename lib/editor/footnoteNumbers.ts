import type { Node as PMNode } from "@tiptap/pm/model";

type FootnoteIndex = {
  byId: Map<string, number>;
  byPos: Map<number, number>;
};

const cache = new WeakMap<PMNode, FootnoteIndex>();

function indexFootnotes(doc: PMNode): FootnoteIndex {
  const hit = cache.get(doc);
  if (hit) return hit;

  const byId = new Map<string, number>();
  const byPos = new Map<number, number>();
  let number = 0;
  doc.descendants((node, pos) => {
    if (node.type.name !== "footnoteRef") return;
    number += 1;
    const id = String(node.attrs.id ?? "");
    if (id) byId.set(id, number);
    byPos.set(pos, number);
  });
  const next = { byId, byPos };
  cache.set(doc, next);
  return next;
}

/**
 * 1-based footnote number for the atom at `pos` / `id`.
 * Cached per immutable ProseMirror doc so N footnote node views do not each
 * walk a long essay on every transaction.
 */
export function footnoteNumberAt(
  doc: PMNode,
  pos: number | null | undefined,
  id?: string
): number {
  const index = indexFootnotes(doc);
  if (id) {
    const fromId = index.byId.get(id);
    if (fromId) return fromId;
  }
  if (typeof pos === "number") {
    const fromPos = index.byPos.get(pos);
    if (fromPos) return fromPos;
  }
  return 1;
}

export type RailNote = {
  id: string;
  content: string;
  number: number;
};

const railCache = new WeakMap<PMNode, RailNote[]>();

/** Footnote list for the sidenote rail, cached per doc identity. */
export function collectRailNotes(doc: PMNode): RailNote[] {
  const hit = railCache.get(doc);
  if (hit) return hit;

  const list: RailNote[] = [];
  let number = 0;
  doc.descendants((node) => {
    if (node.type.name !== "footnoteRef") return;
    number += 1;
    list.push({
      id: String(node.attrs.id ?? ""),
      content: String(node.attrs.content ?? ""),
      number,
    });
  });
  railCache.set(doc, list);
  return list;
}

export function railNotesEqual(a: RailNote[], b: RailNote[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const left = a[i];
    const right = b[i];
    if (
      left.id !== right.id ||
      left.content !== right.content ||
      left.number !== right.number
    ) {
      return false;
    }
  }
  return true;
}
