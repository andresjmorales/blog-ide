import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Editor } from "@tiptap/core";
import type { Mapping } from "@tiptap/pm/transform";
import type { Transaction } from "@tiptap/pm/state";
import {
  bibleScanBounds,
  collectBibleRefHits,
  collectBibleRefHitsInRange,
  type BibleRefHit,
} from "@/lib/bible/hits";
import {
  changedRangeInNewDoc,
  isAtomOnlyChange,
  rangesOverlap,
} from "@/lib/editor/changedRange";
import { openBiblePin } from "@/lib/pins/pinStore";

export type BibleRefHighlightState = {
  hits: BibleRefHit[];
  activeId: string | null;
};

export const bibleRefHighlightKey = new PluginKey<BibleRefHighlightState>(
  "blogideBibleRefHighlight"
);

const EMPTY: BibleRefHighlightState = { hits: [], activeId: null };

type BibleStorage = {
  enabled: boolean;
  hoverTimer: ReturnType<typeof setTimeout> | null;
};

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    bibleRefHighlight: {
      setBibleRefsEnabled: (enabled: boolean) => ReturnType;
      setBibleRefActive: (id: string | null) => ReturnType;
      holdBibleRefCard: () => ReturnType;
      releaseBibleRefCard: () => ReturnType;
    };
  }
  interface Storage {
    bibleRefHighlight: BibleStorage;
  }
}

function setState(editor: Editor, state: BibleRefHighlightState) {
  if (editor.isDestroyed) return;
  const tr = editor.state.tr.setMeta(bibleRefHighlightKey, state);
  tr.setMeta("addToHistory", false);
  editor.view.dispatch(tr);
}

export function getBibleRefState(editor: Editor): BibleRefHighlightState {
  return bibleRefHighlightKey.getState(editor.state) ?? EMPTY;
}

function scan(doc: Parameters<typeof collectBibleRefHits>[0]) {
  return collectBibleRefHits(doc);
}

function mapHit(hit: BibleRefHit, mapping: Mapping): BibleRefHit | null {
  const from = mapping.map(hit.from, 1);
  const to = mapping.map(hit.to, -1);
  if (to <= from) return null;
  if (from === hit.from && to === hit.to) return hit;
  return {
    ...hit,
    from,
    to,
    id: `${from}-${to}-${hit.serialized}`,
  };
}

function preserveBibleActiveId(
  prev: BibleRefHighlightState,
  hits: BibleRefHit[]
): string | null {
  if (!prev.activeId) return null;
  if (hits.some((hit) => hit.id === prev.activeId)) return prev.activeId;
  const prevHit = prev.hits.find((hit) => hit.id === prev.activeId);
  if (!prevHit) return null;
  const match = hits.find(
    (hit) =>
      hit.serialized === prevHit.serialized &&
      rangesOverlap(hit.from, hit.to, prevHit.from, prevHit.to)
  );
  return match?.id ?? null;
}

function applyDocChange(
  tr: Transaction,
  value: BibleRefHighlightState
): BibleRefHighlightState {
  const changed = changedRangeInNewDoc(tr);
  if (!changed) return value;

  const mappedHits = value.hits
    .map((hit) => mapHit(hit, tr.mapping))
    .filter((hit): hit is BibleRefHit => hit != null);

  if (isAtomOnlyChange(tr.doc, changed.from, changed.to)) {
    return {
      hits: mappedHits,
      activeId: preserveBibleActiveId(value, mappedHits),
    };
  }

  const bounds = bibleScanBounds(tr.doc, changed.from, changed.to);
  const kept = mappedHits.filter(
    (hit) => hit.to <= bounds.from || hit.from >= bounds.to
  );
  const fresh = collectBibleRefHitsInRange(tr.doc, bounds.from, bounds.to);
  const hits = [...kept, ...fresh].sort(
    (a, b) => a.from - b.from || a.to - b.to
  );
  return { hits, activeId: preserveBibleActiveId(value, hits) };
}

function markFromEvent(event: Event): HTMLElement | null {
  const target = event.target;
  if (!(target instanceof Element)) return null;
  const mark = target.closest("[data-bible-ref-id]");
  return mark instanceof HTMLElement ? mark : null;
}

export const BibleRefHighlight = Extension.create({
  name: "bibleRefHighlight",

  addStorage() {
    return {
      enabled: false,
      hoverTimer: null,
    } satisfies BibleStorage;
  },

  addCommands() {
    return {
      setBibleRefsEnabled:
        (enabled: boolean) =>
        ({ editor }) => {
          const storage = editor.storage.bibleRefHighlight;
          storage.enabled = enabled;
          if (storage.hoverTimer) {
            clearTimeout(storage.hoverTimer);
            storage.hoverTimer = null;
          }
          if (!enabled) {
            setState(editor, EMPTY);
            return true;
          }
          setState(editor, {
            hits: scan(editor.state.doc),
            activeId: null,
          });
          return true;
        },
      setBibleRefActive:
        (id: string | null) =>
        ({ editor }) => {
          const current = getBibleRefState(editor);
          if (current.activeId === id) return true;
          setState(editor, { ...current, activeId: id });
          return true;
        },
      holdBibleRefCard:
        () =>
        ({ editor }) => {
          const storage = editor.storage.bibleRefHighlight;
          if (storage.hoverTimer) {
            clearTimeout(storage.hoverTimer);
            storage.hoverTimer = null;
          }
          return true;
        },
      releaseBibleRefCard:
        () =>
        ({ editor }) => {
          const storage = editor.storage.bibleRefHighlight;
          if (storage.hoverTimer) clearTimeout(storage.hoverTimer);
          storage.hoverTimer = setTimeout(() => {
            storage.hoverTimer = null;
            if (!editor.isDestroyed) {
              editor.commands.setBibleRefActive(null);
            }
          }, 280);
          return true;
        },
    };
  },

  onDestroy() {
    const storage = this.editor.storage.bibleRefHighlight;
    if (storage.hoverTimer) clearTimeout(storage.hoverTimer);
  },

  addProseMirrorPlugins() {
    const extensionEditor = this.editor;
    let lastDecoState: BibleRefHighlightState | null = null;
    let lastDecoSet: DecorationSet | null = null;
    return [
      new Plugin<BibleRefHighlightState>({
        key: bibleRefHighlightKey,
        state: {
          init: (_, state) => {
            if (!extensionEditor.storage.bibleRefHighlight.enabled) {
              return EMPTY;
            }
            return { hits: scan(state.doc), activeId: null };
          },
          apply(tr, value) {
            const meta = tr.getMeta(bibleRefHighlightKey) as
              | BibleRefHighlightState
              | undefined;
            if (meta) return meta;
            if (!extensionEditor.storage.bibleRefHighlight.enabled) {
              return EMPTY;
            }
            if (!tr.docChanged) return value;
            return applyDocChange(tr, value);
          },
        },
        props: {
          decorations(state) {
            const pluginState = bibleRefHighlightKey.getState(state);
            if (!pluginState || pluginState.hits.length === 0) return null;
            if (pluginState === lastDecoState && lastDecoSet) {
              return lastDecoSet;
            }
            const decos = pluginState.hits.map((hit) =>
              Decoration.inline(hit.from, hit.to, {
                class:
                  hit.id === pluginState.activeId
                    ? "blogide-bible-ref is-active"
                    : "blogide-bible-ref",
                "data-bible-ref-id": hit.id,
              })
            );
            lastDecoState = pluginState;
            lastDecoSet = DecorationSet.create(state.doc, decos);
            return lastDecoSet;
          },
          handleClick(_view, _pos, event) {
            const mark = markFromEvent(event);
            if (!mark) {
              const current = getBibleRefState(extensionEditor);
              if (current.activeId) {
                extensionEditor.commands.setBibleRefActive(null);
              }
              return false;
            }
            const id = mark.getAttribute("data-bible-ref-id");
            if (!id) return false;
            const hit = getBibleRefState(extensionEditor).hits.find(
              (item) => item.id === id
            );
            extensionEditor.commands.setBibleRefActive(id);
            if (hit) {
              openBiblePin({ search: hit.search, title: hit.label });
            }
            return false;
          },
          handleDOMEvents: {
            mouseover(_view, event) {
              if (!extensionEditor.storage.bibleRefHighlight.enabled) {
                return false;
              }
              const mark = markFromEvent(event);
              if (!mark) return false;
              const id = mark.getAttribute("data-bible-ref-id");
              if (!id) return false;
              extensionEditor.commands.holdBibleRefCard();
              extensionEditor.commands.setBibleRefActive(id);
              return false;
            },
            mouseout(_view, event) {
              const mark = markFromEvent(event);
              if (!mark) return false;
              const related = event.relatedTarget;
              if (
                related instanceof Node &&
                mark.contains(related)
              ) {
                return false;
              }
              extensionEditor.commands.releaseBibleRefCard();
              return false;
            },
          },
        },
      }),
    ];
  },
});
