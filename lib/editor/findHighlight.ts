import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
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
            // Drop match decorations on any content edit. Mapping ranges would
            // stretch highlights as the user types inside a hit, and leave
            // ghost marks on unrelated text after the query no longer matches.
            // FindReplacePanel re-scans on editor updates and restores hits.
            let scopeRange = value.scopeRange;
            if (scopeRange) {
              scopeRange = {
                from: tr.mapping.map(scopeRange.from),
                to: tr.mapping.map(scopeRange.to),
              };
              if (scopeRange.from >= scopeRange.to) {
                scopeRange = null;
              }
            }
            return {
              matches: [],
              activeIndex: 0,
              scopeRange,
            };
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

export function setFindHighlights(
  editor: Editor,
  matches: FindMatch[],
  activeIndex: number,
  scopeRange: DocRange | null = null
): void {
  const tr = editor.state.tr.setMeta(findHighlightKey, {
    matches,
    activeIndex: matches.length === 0 ? 0 : activeIndex,
    scopeRange,
  } satisfies FindHighlightState);
  tr.setMeta("addToHistory", false);
  editor.view.dispatch(tr);
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
