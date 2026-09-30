import { Extension } from "@tiptap/core";
import type { Editor } from "@tiptap/core";
import { Plugin, PluginKey, type EditorState } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

/**
 * Comment highlights: decorations only, never marks, so comment activity
 * can't touch the essay's markdown. Ranges come from resolved anchors
 * (lib/comments/anchors.ts). While typing, the set is mapped through each
 * transaction; anchors are re-resolved on the "after typing" lane by
 * `useCommentHighlights`, which replaces the set with a meta transaction.
 */

export type CommentHighlightRange = {
  threadId: string;
  from: number;
  to: number;
};

/** A footnote marker whose note has an open thread (painted as a dot). */
export type CommentFootnoteDot = {
  pos: number;
  threadIds: string[];
};

export type CommentHighlightInput = {
  ranges: CommentHighlightRange[];
  dots: CommentFootnoteDot[];
  activeThreadId: string | null;
};

type CommentHighlightState = CommentHighlightInput & {
  decorations: DecorationSet;
};

export const commentHighlightsKey = new PluginKey<CommentHighlightState>(
  "blogideCommentHighlights"
);

const EMPTY: CommentHighlightState = {
  ranges: [],
  dots: [],
  activeThreadId: null,
  decorations: DecorationSet.empty,
};

export const COMMENT_THREAD_ATTR = "data-comment-thread";

function buildDecorations(
  doc: EditorState["doc"],
  input: CommentHighlightInput
): DecorationSet {
  const decos: Decoration[] = [];
  const size = doc.content.size;
  for (const range of input.ranges) {
    if (range.from < 0 || range.to > size || range.to <= range.from) continue;
    const active = range.threadId === input.activeThreadId;
    decos.push(
      Decoration.inline(
        range.from,
        range.to,
        {
          class: active ? "blogide-comment is-active" : "blogide-comment",
          [COMMENT_THREAD_ATTR]: range.threadId,
        },
        { threadId: range.threadId }
      )
    );
  }
  for (const dot of input.dots) {
    const node = doc.nodeAt(dot.pos);
    if (!node || node.type.name !== "footnoteRef") continue;
    const active =
      input.activeThreadId != null && dot.threadIds.includes(input.activeThreadId);
    decos.push(
      Decoration.node(
        dot.pos,
        dot.pos + node.nodeSize,
        {
          class: active
            ? "has-comment-thread is-comment-active"
            : "has-comment-thread",
        },
        { threadIds: dot.threadIds }
      )
    );
  }
  return decos.length > 0 ? DecorationSet.create(doc, decos) : DecorationSet.empty;
}

export function rangesEqual(
  a: CommentHighlightInput,
  b: CommentHighlightInput
): boolean {
  if (a.activeThreadId !== b.activeThreadId) return false;
  if (a.ranges.length !== b.ranges.length || a.dots.length !== b.dots.length) {
    return false;
  }
  for (let i = 0; i < a.ranges.length; i++) {
    const x = a.ranges[i];
    const y = b.ranges[i];
    if (x.threadId !== y.threadId || x.from !== y.from || x.to !== y.to) {
      return false;
    }
  }
  for (let i = 0; i < a.dots.length; i++) {
    const x = a.dots[i];
    const y = b.dots[i];
    if (x.pos !== y.pos || x.threadIds.join() !== y.threadIds.join()) {
      return false;
    }
  }
  return true;
}

export type CommentHighlightsOptions = {
  /** Clicking a highlight or a marked footnote reference. */
  onActivate: ((threadId: string) => void) | null;
};

export const CommentHighlights = Extension.create<CommentHighlightsOptions>({
  name: "commentHighlights",

  addOptions() {
    return { onActivate: null };
  },

  addProseMirrorPlugins() {
    const options = this.options;
    return [
      new Plugin<CommentHighlightState>({
        key: commentHighlightsKey,
        state: {
          init: () => EMPTY,
          apply(tr, value) {
            const meta = tr.getMeta(commentHighlightsKey) as
              | CommentHighlightState
              | undefined;
            if (meta) return meta;
            if (!tr.docChanged || value.decorations === DecorationSet.empty) {
              return value;
            }
            // Hot path: map, never rebuild.
            return {
              ...value,
              decorations: value.decorations.map(tr.mapping, tr.doc),
            };
          },
        },
        props: {
          decorations(state) {
            const value = commentHighlightsKey.getState(state);
            return value && value.decorations !== DecorationSet.empty
              ? value.decorations
              : null;
          },
          handleClick(view, pos) {
            if (!options.onActivate) return false;
            const value = commentHighlightsKey.getState(view.state);
            if (!value || value.decorations === DecorationSet.empty) return false;
            const hits = value.decorations.find(pos, pos, (spec) =>
              Boolean(spec.threadId)
            );
            if (hits.length === 0) return false;
            // Innermost (shortest) highlight wins when threads overlap.
            hits.sort((a, b) => a.to - a.from - (b.to - b.from));
            options.onActivate(String(hits[0].spec.threadId));
            // Keep ProseMirror's own click handling (caret placement).
            return false;
          },
        },
      }),
    ];
  },
});

/** Replace the highlight set. Returns true when a transaction was sent. */
export function setCommentHighlights(
  editor: Editor,
  input: CommentHighlightInput
): boolean {
  if (editor.isDestroyed) return false;
  const current = commentHighlightsKey.getState(editor.state);
  if (!current) return false;
  if (rangesEqual(current, input)) return false;
  const next: CommentHighlightState = {
    ...input,
    decorations: buildDecorations(editor.state.doc, input),
  };
  const tr = editor.state.tr.setMeta(commentHighlightsKey, next);
  tr.setMeta("addToHistory", false);
  editor.view.dispatch(tr);
  return true;
}

/**
 * Current (mapped) range for a thread's highlight, e.g. to scroll to it
 * before the next re-resolve.
 */
export function mappedCommentRange(
  editor: Editor,
  threadId: string
): { from: number; to: number } | null {
  const value = commentHighlightsKey.getState(editor.state);
  if (!value) return null;
  const hits = value.decorations.find(
    undefined,
    undefined,
    (spec) => spec.threadId === threadId
  );
  if (hits.length === 0) return null;
  return { from: hits[0].from, to: hits[0].to };
}
