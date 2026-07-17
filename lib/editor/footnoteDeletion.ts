import { Extension } from "@tiptap/core";
import { Plugin } from "@tiptap/pm/state";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import {
  MAX_DELETED_FOOTNOTES,
  mergeDeletedFootnotes,
  type DeletedFootnote,
} from "@/lib/markdown/deletedFootnotes";

/** Suppress archival during full document reloads (setContent / source toggle). */
let suppressFootnoteDeletion = 0;

export function withoutFootnoteDeletionTracking<T>(run: () => T): T {
  suppressFootnoteDeletion += 1;
  try {
    return run();
  } finally {
    suppressFootnoteDeletion -= 1;
  }
}

function collectFootnotes(
  doc: ProseMirrorNode
): Map<string, { id: string; content: string }> {
  const found = new Map<string, { id: string; content: string }>();
  doc.descendants((node) => {
    if (node.type.name !== "footnoteRef") return true;
    const id = String(node.attrs.id ?? "");
    if (!id) return true;
    found.set(id, {
      id,
      content: String(node.attrs.content ?? ""),
    });
    return true;
  });
  return found;
}

function readDeleted(doc: ProseMirrorNode): DeletedFootnote[] {
  const raw = doc.attrs.deletedFootnotes;
  return Array.isArray(raw) ? (raw as DeletedFootnote[]) : [];
}

/**
 * When footnoteRef atoms disappear from the document, archive them on
 * doc.attrs.deletedFootnotes for later restore from the sidenote rail.
 */
export const FootnoteDeletionTracker = Extension.create({
  name: "footnoteDeletionTracker",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        appendTransaction(transactions, oldState, newState) {
          if (suppressFootnoteDeletion > 0) return null;
          if (!transactions.some((transaction) => transaction.docChanged)) {
            return null;
          }

          // Skip attribute-only syncs from restore/dismiss commands.
          if (
            transactions.some((transaction) =>
              transaction.getMeta("blogide-skip-footnote-delete")
            )
          ) {
            return null;
          }

          const before = collectFootnotes(oldState.doc);
          const after = collectFootnotes(newState.doc);
          const removed: DeletedFootnote[] = [];
          const now = new Date().toISOString();

          for (const [id, entry] of before) {
            if (!after.has(id)) {
              removed.push({
                id: entry.id,
                content: entry.content,
                deletedAt: now,
              });
            }
          }

          if (removed.length === 0) return null;

          const merged = mergeDeletedFootnotes(
            readDeleted(newState.doc),
            removed
          ).slice(0, MAX_DELETED_FOOTNOTES);

          return newState.tr
            .setMeta("blogide-skip-footnote-delete", true)
            .setDocAttribute("deletedFootnotes", merged);
        },
      }),
    ];
  },
});
