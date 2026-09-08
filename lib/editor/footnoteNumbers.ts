import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { Node as PMNode } from "@tiptap/pm/model";
import { transactionTouchesNodeType } from "@/lib/editor/changedRange";

export type RailNote = {
  id: string;
  content: string;
  number: number;
};

export type FootnoteIndex = {
  byId: Map<string, number>;
  byPos: Map<number, number>;
  notes: RailNote[];
};

export const footnoteIndexKey = new PluginKey<FootnoteIndex>(
  "blogideFootnoteIndex"
);

const cache = new WeakMap<PMNode, FootnoteIndex>();

export function emptyFootnoteIndex(): FootnoteIndex {
  return {
    byId: new Map(),
    byPos: new Map(),
    notes: [],
  };
}

export function indexFootnotes(doc: PMNode): FootnoteIndex {
  const hit = cache.get(doc);
  if (hit) return hit;

  const byId = new Map<string, number>();
  const byPos = new Map<number, number>();
  const notes: RailNote[] = [];
  let number = 0;
  doc.descendants((node, pos) => {
    if (node.type.name !== "footnoteRef") return;
    number += 1;
    const id = String(node.attrs.id ?? "");
    const content = String(node.attrs.content ?? "");
    if (id) byId.set(id, number);
    byPos.set(pos, number);
    notes.push({ id, content, number });
  });
  const next = { byId, byPos, notes };
  cache.set(doc, next);
  return next;
}

/**
 * 1-based footnote number for the atom at `pos` / `id`.
 * Prefer plugin state (no walk on body typing). WeakMap is the fallback.
 */
export function footnoteNumberAt(
  doc: PMNode,
  pos: number | null | undefined,
  id?: string,
  index?: FootnoteIndex | null
): number {
  const resolved = index ?? indexFootnotes(doc);
  if (id) {
    const fromId = resolved.byId.get(id);
    if (fromId) return fromId;
  }
  if (typeof pos === "number") {
    const fromPos = resolved.byPos.get(pos);
    if (fromPos) return fromPos;
  }
  return 1;
}

/** Footnote list for the sidenote rail, cached per doc identity. */
export function collectRailNotes(doc: PMNode): RailNote[] {
  return indexFootnotes(doc).notes;
}

export function railNotesEqual(
  a: RailNote[],
  b: RailNote[] | null
): boolean {
  if (b == null) return false;
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

/**
 * Incremental footnote index. Body typing does not walk the essay.
 */
export const FootnoteIndexPlugin = Extension.create({
  name: "footnoteIndex",

  addProseMirrorPlugins() {
    return [
      new Plugin<FootnoteIndex>({
        key: footnoteIndexKey,
        state: {
          init: (_, state) => indexFootnotes(state.doc),
          apply(tr, value, oldState, newState) {
            if (!tr.docChanged) return value;
            if (
              !transactionTouchesNodeType(
                tr,
                oldState.doc,
                newState.doc,
                "footnoteRef"
              )
            ) {
              return value;
            }
            return indexFootnotes(newState.doc);
          },
        },
      }),
    ];
  },
});
