import { Extension, type Editor } from "@tiptap/core";
import { Plugin } from "@tiptap/pm/state";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import {
  citationsSnapshotEqual,
  pruneEssayCitations,
} from "@/lib/citations/essaySources";
import type { EssayCitation } from "@/lib/markdown/essayCitations";
import {
  MAX_DELETED_FOOTNOTES,
  mergeDeletedFootnotes,
  type DeletedFootnote,
} from "@/lib/markdown/deletedFootnotes";
import { transactionTouchesNodeType } from "@/lib/editor/changedRange";
import {
  EDITOR_WORK_MS,
  scheduleEditorWork,
} from "@/lib/editor/workSchedule";

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

function readCitations(doc: ProseMirrorNode): EssayCitation[] {
  return Array.isArray(doc.attrs.essayCitations)
    ? (doc.attrs.essayCitations as EssayCitation[])
    : [];
}

function pruneCitationsNow(editor: Editor): void {
  if (editor.isDestroyed) return;
  const citations = readCitations(editor.state.doc);
  if (citations.length === 0) return;
  const pruned = pruneEssayCitations(citations, editor.state.doc);
  if (citationsSnapshotEqual(citations, pruned)) return;
  editor.view.dispatch(
    editor.state.tr
      .setMeta("blogide-skip-footnote-delete", true)
      .setDocAttribute("essayCitations", pruned)
  );
}

/**
 * When footnoteRef atoms disappear from the document, archive them on
 * doc.attrs.deletedFootnotes for later restore from the sidenote rail.
 *
 * Citation prune walks the whole essay (footnote bodies + searchable text).
 * Body typing schedules that on the cite-inventory lane instead.
 */
export const FootnoteDeletionTracker = Extension.create({
  name: "footnoteDeletionTracker",

  addProseMirrorPlugins() {
    const editor = this.editor;
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

          const touchedFootnotes = transactions.some(
            (transaction) =>
              transaction.docChanged &&
              transactionTouchesNodeType(
                transaction,
                oldState.doc,
                newState.doc,
                "footnoteRef"
              )
          );

          const citations = readCitations(newState.doc);
          if (!touchedFootnotes) {
            if (citations.length > 0) {
              scheduleEditorWork(
                "prune-citations",
                EDITOR_WORK_MS.citeInventory,
                () => pruneCitationsNow(editor)
              );
            }
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

          if (removed.length === 0) {
            if (citations.length > 0) {
              scheduleEditorWork(
                "prune-citations",
                EDITOR_WORK_MS.citeInventory,
                () => pruneCitationsNow(editor)
              );
            }
            return null;
          }

          const pruned = pruneEssayCitations(citations, newState.doc);
          const citationsChanged = !citationsSnapshotEqual(citations, pruned);

          const merged = mergeDeletedFootnotes(
            readDeleted(newState.doc),
            removed
          ).slice(0, MAX_DELETED_FOOTNOTES);

          let next = newState.tr.setMeta("blogide-skip-footnote-delete", true);
          next = next.setDocAttribute("deletedFootnotes", merged);
          if (citationsChanged) {
            next = next.setDocAttribute("essayCitations", pruned);
          }
          return next;
        },
      }),
    ];
  },
});
