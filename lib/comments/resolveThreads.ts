import type { Node as PMNode } from "@tiptap/pm/model";
import { resolveAnchor, offsetAtPos, projectText } from "@/lib/comments/anchors";
import { footnoteDocFromMarkdown } from "@/lib/comments/footnoteText";
import type {
  CommentFootnoteDot,
  CommentHighlightInput,
  CommentHighlightRange,
} from "@/lib/comments/highlights";
import type { CommentThread, ThreadPlacement } from "@/lib/comments/types";
import { indexFootnotes, type FootnoteIndex } from "@/lib/editor/footnoteNumbers";

export type ThreadResolution = {
  highlights: CommentHighlightInput;
  placements: Record<string, ThreadPlacement>;
};

/**
 * Resolve every thread against the essay: body threads become highlight
 * ranges, footnote threads resolve inside their note's text and mark the
 * footnote reference. Resolved threads keep a placement (for document
 * order and "detached") but are not painted. Runs on the after-typing
 * lane, never per keystroke.
 */
export function resolveThreads(
  doc: PMNode,
  threads: CommentThread[],
  activeThreadId: string | null,
  footnoteIndex?: FootnoteIndex | null
): ThreadResolution {
  const ranges: CommentHighlightRange[] = [];
  const placements: Record<string, ThreadPlacement> = {};
  const dotThreads = new Map<number, string[]>();
  let notes: { byId: Map<string, { pos: number; number: number; content: string }> } | null =
    null;

  function footnotes() {
    if (notes) return notes;
    const index = footnoteIndex ?? indexFootnotes(doc);
    const byId = new Map<string, { pos: number; number: number; content: string }>();
    for (const [pos, number] of index.byPos) {
      const note = index.notes[number - 1];
      if (note?.id) byId.set(note.id, { pos, number, content: note.content });
    }
    notes = { byId };
    return notes;
  }

  for (const thread of threads) {
    const anchor = thread.root.anchor;
    const open = thread.root.status === "open";
    if (anchor.scope === "body") {
      const hit = resolveAnchor(doc, anchor);
      if (!hit) {
        placements[thread.id] = { detached: true, order: 0, subOrder: 0 };
        continue;
      }
      placements[thread.id] = { detached: false, order: hit.from, subOrder: 0 };
      if (open) ranges.push({ threadId: thread.id, from: hit.from, to: hit.to });
      continue;
    }
    const note = anchor.footnoteId
      ? footnotes().byId.get(anchor.footnoteId)
      : undefined;
    if (!note) {
      placements[thread.id] = { detached: true, order: 0, subOrder: 0 };
      continue;
    }
    const noteDoc = footnoteDocFromMarkdown(note.content);
    const hit = resolveAnchor(noteDoc, anchor);
    if (!hit) {
      placements[thread.id] = {
        detached: true,
        order: 0,
        subOrder: 0,
        footnoteNumber: note.number,
      };
      continue;
    }
    placements[thread.id] = {
      detached: false,
      order: note.pos,
      subOrder: offsetAtPos(projectText(noteDoc), hit.from),
      footnoteNumber: note.number,
    };
    if (open) {
      const list = dotThreads.get(note.pos) ?? [];
      list.push(thread.id);
      dotThreads.set(note.pos, list);
    }
  }

  ranges.sort((a, b) => a.from - b.from || a.to - b.to);
  const dots: CommentFootnoteDot[] = [...dotThreads.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([pos, threadIds]) => ({ pos, threadIds }));

  return {
    highlights: { ranges, dots, activeThreadId },
    placements,
  };
}

/** Highlights for one open footnote card's nested editor. */
export function resolveFootnoteThreads(
  noteDoc: PMNode,
  footnoteId: string,
  threads: CommentThread[],
  activeThreadId: string | null
): CommentHighlightInput {
  const ranges: CommentHighlightRange[] = [];
  for (const thread of threads) {
    const anchor = thread.root.anchor;
    if (
      anchor.scope !== "footnote" ||
      anchor.footnoteId !== footnoteId ||
      thread.root.status !== "open"
    ) {
      continue;
    }
    const hit = resolveAnchor(noteDoc, anchor);
    if (hit) ranges.push({ threadId: thread.id, from: hit.from, to: hit.to });
  }
  ranges.sort((a, b) => a.from - b.from || a.to - b.to);
  return { ranges, dots: [], activeThreadId };
}
