import { Extension } from "@tiptap/core";
import { Plugin, PluginKey, type Transaction } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Editor } from "@tiptap/core";
import type { FindMatch } from "@/lib/editor/findReplace";
import type { DocRange } from "@/lib/editor/findReplaceInEditor";

export type FindHighlightState = {
  matches: FindMatch[];
  activeIndex: number;
  /** Soft highlight for find-in-selection bounds. */
  scopeRange: DocRange | null;
};

export const findHighlightKey = new PluginKey<FindHighlightState>(
  "blogideFindHighlight"
);

const EMPTY: FindHighlightState = {
  matches: [],
  activeIndex: 0,
  scopeRange: null,
};

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
  a: FindHighlightState,
  b: FindHighlightState
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
export function mapFindHighlightState(
  value: FindHighlightState,
  tr: Transaction
): FindHighlightState {
  if (value.matches.length === 0 && !value.scopeRange) {
    return value;
  }

  let changed = false;
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

  if (!changed) {
    return value;
  }

  return {
    matches,
    activeIndex:
      matches.length === 0
        ? 0
        : Math.min(value.activeIndex, matches.length - 1),
    scopeRange,
  };
}

const SCROLL_PAD_PX = 80;
const EDITOR_SCROLL_SELECTOR = "[data-blogide-editor-scroll]";

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
            if (!pluginState) {
              return null;
            }
            const decos: ReturnType<typeof Decoration.inline>[] = [];
            if (
              pluginState.scopeRange &&
              pluginState.scopeRange.from < pluginState.scopeRange.to
            ) {
              decos.push(
                Decoration.inline(
                  pluginState.scopeRange.from,
                  pluginState.scopeRange.to,
                  { class: "blogide-find-scope" }
                )
              );
            }
            for (let i = 0; i < pluginState.matches.length; i++) {
              const match = pluginState.matches[i];
              const cls =
                i === pluginState.activeIndex
                  ? "blogide-find-match is-current"
                  : "blogide-find-match";
              if (match.footnotePos != null) {
                const node = state.doc.nodeAt(match.footnotePos);
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
              decos.push(
                Decoration.inline(match.from, match.to, {
                  class: cls,
                })
              );
            }
            if (decos.length === 0) {
              return null;
            }
            return DecorationSet.create(state.doc, decos);
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
  const next: FindHighlightState = {
    matches,
    activeIndex: matches.length === 0 ? 0 : activeIndex,
    scopeRange,
  };
  const current = findHighlightKey.getState(editor.state);
  if (current && findHighlightStatesEqual(current, next)) {
    return false;
  }
  const tr = editor.state.tr.setMeta(findHighlightKey, next);
  tr.setMeta("addToHistory", false);
  editor.view.dispatch(tr);
  return true;
}

export function clearFindHighlights(editor: Editor): void {
  setFindHighlights(editor, [], 0, null);
}

function findEditorScroller(editor: Editor): HTMLElement | null {
  const rooted = editor.view.dom.closest(EDITOR_SCROLL_SELECTOR);
  if (rooted instanceof HTMLElement) {
    return rooted;
  }
  let root: Element | null = editor.view.dom.parentElement;
  let fallback: HTMLElement | null = null;
  while (root) {
    if (root instanceof HTMLElement) {
      const style = getComputedStyle(root);
      if (
        /(auto|scroll|overlay)/.test(
          `${style.overflow}${style.overflowY}${style.overflowX}`
        )
      ) {
        fallback = root;
        if (root.scrollHeight > root.clientHeight + 1) {
          return root;
        }
      }
    }
    root = root.parentElement;
  }
  return fallback;
}

/**
 * Scroll so the match sits in view inside the essay scroller only.
 * Avoids `Element.scrollIntoView`, which also yanks outer page/panels.
 */
export function scrollMatchIntoView(editor: Editor, match: FindMatch): void {
  requestAnimationFrame(() => {
    try {
      const scroller = findEditorScroller(editor);
      if (!scroller) return;

      const pos = match.footnotePos ?? match.from;
      const endPos =
        match.footnotePos != null ? match.footnotePos : match.to;
      const start = editor.view.coordsAtPos(pos);
      const end = editor.view.coordsAtPos(endPos);
      const matchTop = Math.min(start.top, end.top);
      const matchBottom = Math.max(start.bottom, end.bottom);
      const matchMid = (matchTop + matchBottom) / 2;

      const rect = scroller.getBoundingClientRect();
      const viewMid = (rect.top + rect.bottom) / 2;
      const inView =
        matchTop >= rect.top + SCROLL_PAD_PX &&
        matchBottom <= rect.bottom - SCROLL_PAD_PX;

      if (inView) {
        return;
      }

      // Instant scroll — smooth stacking on each keystroke feels broken.
      scroller.scrollTop += matchMid - viewMid;
    } catch {
      // ignore invalid positions
    }
  });
}
