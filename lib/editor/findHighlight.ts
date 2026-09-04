import { Extension } from "@tiptap/core";
import { Plugin, PluginKey, type Transaction } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Editor } from "@tiptap/core";
import type { FindMatch } from "@/lib/editor/findReplace";
import type { DocRange } from "@/lib/editor/findReplaceInEditor";
import {
  boxAtEditorPos,
  coordsBox,
  findEditorScroller,
  scrollScrollerToTarget,
} from "@/lib/editor/editorScroll";

export type FindHighlightState = {
  matches: FindMatch[];
  activeIndex: number;
  /** Soft highlight for find-in-selection bounds. */
  scopeRange: DocRange | null;
  /** Mapped in place so edits do not tear down and rebuild highlight marks. */
  decorations: DecorationSet;
};

export const findHighlightKey = new PluginKey<FindHighlightState>(
  "blogideFindHighlight"
);

const EMPTY: FindHighlightState = {
  matches: [],
  activeIndex: 0,
  scopeRange: null,
  decorations: DecorationSet.empty,
};

type FindHighlightFields = Omit<FindHighlightState, "decorations">;

function rangesEqual(
  a: DocRange | null | undefined,
  b: DocRange | null | undefined
): boolean {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  return a.from === b.from && a.to === b.to;
}

function matchesEqual(a: FindMatch[], b: FindMatch[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const left = a[i];
    const right = b[i];
    if (
      left.from !== right.from ||
      left.to !== right.to ||
      left.footnotePos !== right.footnotePos
    ) {
      return false;
    }
  }
  return true;
}

export function findHighlightStatesEqual(
  a: FindHighlightFields,
  b: FindHighlightFields
): boolean {
  if (a === b) return true;
  return (
    a.activeIndex === b.activeIndex &&
    rangesEqual(a.scopeRange, b.scopeRange) &&
    matchesEqual(a.matches, b.matches)
  );
}

function mapFindMatch(match: FindMatch, tr: Transaction): FindMatch | null {
  if (match.footnotePos != null) {
    const footnotePos = tr.mapping.map(match.footnotePos);
    const node = tr.doc.nodeAt(footnotePos);
    if (!node || node.type.name !== "footnoteRef") {
      return null;
    }
    if (footnotePos === match.footnotePos) {
      return match;
    }
    return { ...match, footnotePos };
  }
  const from = tr.mapping.map(match.from, 1);
  const to = tr.mapping.map(match.to, -1);
  if (to <= from) {
    return null;
  }
  if (from === match.from && to === match.to) {
    return match;
  }
  return { ...match, from, to };
}

/**
 * Keep highlights through edits (browser-style). FindReplacePanel re-scans
 * after updates and replaces mapped ranges when the query no longer matches.
 */
function createFindDecorations(
  doc: Transaction["doc"],
  matches: FindMatch[],
  activeIndex: number,
  scopeRange: DocRange | null
): DecorationSet {
  const decos: ReturnType<typeof Decoration.inline>[] = [];
  if (scopeRange && scopeRange.from < scopeRange.to) {
    decos.push(
      Decoration.inline(scopeRange.from, scopeRange.to, {
        class: "blogide-find-scope",
      })
    );
  }
  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    const cls =
      i === activeIndex ? "blogide-find-match is-current" : "blogide-find-match";
    if (match.footnotePos != null) {
      const node = doc.nodeAt(match.footnotePos);
      if (!node || node.type.name !== "footnoteRef") {
        continue;
      }
      decos.push(
        Decoration.node(
          match.footnotePos,
          match.footnotePos + node.nodeSize,
          { class: `${cls} is-footnote` }
        )
      );
      continue;
    }
    if (match.from < match.to) {
      decos.push(
        Decoration.inline(match.from, match.to, {
          class: cls,
        })
      );
    }
  }
  if (decos.length === 0) {
    return DecorationSet.empty;
  }
  return DecorationSet.create(doc, decos);
}

function restoreFootnoteDecorations(
  doc: Transaction["doc"],
  decorations: DecorationSet,
  matches: FindMatch[],
  activeIndex: number
): DecorationSet {
  let next = decorations;
  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    if (match.footnotePos == null) continue;
    const node = doc.nodeAt(match.footnotePos);
    if (!node || node.type.name !== "footnoteRef") continue;
    const from = match.footnotePos;
    const to = from + node.nodeSize;
    if (next.find(from, to).length > 0) continue;
    const cls =
      i === activeIndex
        ? "blogide-find-match is-current is-footnote"
        : "blogide-find-match is-footnote";
    next = next.add(doc, [Decoration.node(from, to, { class: cls })]);
  }
  return next;
}

export function mapFindHighlightState(
  value: FindHighlightState,
  tr: Transaction
): FindHighlightState {
  if (value.matches.length === 0 && !value.scopeRange) {
    return value;
  }

  let decorations = value.decorations.map(tr.mapping, tr.doc);
  let changed = decorations !== value.decorations;
  const matches: FindMatch[] = [];
  for (const match of value.matches) {
    const mapped = mapFindMatch(match, tr);
    if (!mapped) {
      changed = true;
      continue;
    }
    if (mapped !== match) {
      changed = true;
    }
    matches.push(mapped);
  }

  let scopeRange = value.scopeRange;
  if (scopeRange) {
    const from = tr.mapping.map(scopeRange.from, 1);
    const to = tr.mapping.map(scopeRange.to, -1);
    if (from >= to) {
      scopeRange = null;
      changed = true;
    } else if (from !== scopeRange.from || to !== scopeRange.to) {
      scopeRange = { from, to };
      changed = true;
    }
  }

  const activeIndex =
    matches.length === 0
      ? 0
      : Math.min(value.activeIndex, matches.length - 1);

  // setNodeMarkup (footnote attr sync) drops node decorations on that atom.
  // Re-add only those so mapped inline hits are not torn down.
  const restored = restoreFootnoteDecorations(
    tr.doc,
    decorations,
    matches,
    activeIndex
  );
  if (restored !== decorations) {
    changed = true;
    decorations = restored;
  }

  if (!changed) {
    return value;
  }

  return {
    matches,
    activeIndex,
    scopeRange,
    decorations,
  };
}

/**
 * Soft find highlights via decorations — does not move the selection or
 * steal focus from the find input.
 */
export const FindHighlight = Extension.create({
  name: "findHighlight",

  addProseMirrorPlugins() {
    return [
      new Plugin<FindHighlightState>({
        key: findHighlightKey,
        state: {
          init: () => EMPTY,
          apply(tr, value) {
            const meta = tr.getMeta(findHighlightKey) as
              | FindHighlightState
              | undefined;
            if (meta) {
              return meta;
            }
            if (!tr.docChanged) {
              return value;
            }
            return mapFindHighlightState(value, tr);
          },
        },
        props: {
          decorations(state) {
            const pluginState = findHighlightKey.getState(state);
            if (!pluginState || pluginState.decorations.find().length === 0) {
              return null;
            }
            return pluginState.decorations;
          },
        },
      }),
    ];
  },
});

/** Returns true when a highlight transaction was dispatched. */
export function setFindHighlights(
  editor: Editor,
  matches: FindMatch[],
  activeIndex: number,
  scopeRange: DocRange | null = null
): boolean {
  const fields: FindHighlightFields = {
    matches,
    activeIndex: matches.length === 0 ? 0 : activeIndex,
    scopeRange,
  };
  const current = findHighlightKey.getState(editor.state);
  if (current && findHighlightStatesEqual(current, fields)) {
    return false;
  }
  const next: FindHighlightState = {
    ...fields,
    decorations: createFindDecorations(
      editor.state.doc,
      fields.matches,
      fields.activeIndex,
      fields.scopeRange
    ),
  };
  const tr = editor.state.tr.setMeta(findHighlightKey, next);
  tr.setMeta("addToHistory", false);
  editor.view.dispatch(tr);
  return true;
}

export function clearFindHighlights(editor: Editor): void {
  setFindHighlights(editor, [], 0, null);
}

function matchBox(
  editor: Editor,
  match: FindMatch
): { top: number; height: number } | null {
  if (match.footnotePos != null) {
    return (
      boxAtEditorPos(editor, match.footnotePos) ??
      coordsBox(editor, match.footnotePos)
    );
  }
  return coordsBox(editor, match.from, match.to);
}

/**
 * Scroll so the match sits in view inside the essay scroller only.
 * Avoids `Element.scrollIntoView`, which also yanks outer page/panels.
 * Uses the same aligned scroller math as outline headings. End-of-block
 * `coordsAtPos(to)` throws are ignored so Find Next still moves.
 */
export function scrollMatchIntoView(editor: Editor, match: FindMatch): void {
  const run = () => {
    if (editor.isDestroyed) return;
    const scroller = findEditorScroller(editor);
    if (!scroller) return;
    const box = matchBox(editor, match);
    if (!box) return;
    // Instant — smooth stacking on each keystroke feels broken.
    scrollScrollerToTarget(
      scroller,
      { viewportTop: box.top, height: box.height },
      { behavior: "auto" }
    );
  };
  // Two frames: highlight decorations paint, then coords are trustworthy.
  requestAnimationFrame(() => {
    requestAnimationFrame(run);
  });
}
