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
import {
  createHoverIntent,
  type HoverIntent,
} from "@/lib/editor/hoverIntent";

export type BibleRefHighlightState = {
  hits: BibleRefHit[];
  activeId: string | null;
  decorations: DecorationSet;
};

export const bibleRefHighlightKey = new PluginKey<BibleRefHighlightState>(
  "blogideBibleRefHighlight"
);

const EMPTY: BibleRefHighlightState = {
  hits: [],
  activeId: null,
  decorations: DecorationSet.empty,
};

function createBibleDecorations(
  doc: Parameters<typeof DecorationSet.create>[0],
  hits: BibleRefHit[],
  activeId: string | null
): DecorationSet {
  if (hits.length === 0) return DecorationSet.empty;
  return DecorationSet.create(
    doc,
    hits.map((hit) =>
      Decoration.inline(hit.from, hit.to, {
        class:
          hit.id === activeId
            ? "blogide-bible-ref is-active"
            : "blogide-bible-ref",
        "data-bible-ref-id": hit.id,
      })
    )
  );
}

function withBibleDecorations(
  doc: Parameters<typeof DecorationSet.create>[0],
  hits: BibleRefHit[],
  activeId: string | null
): BibleRefHighlightState {
  return {
    hits,
    activeId,
    decorations: createBibleDecorations(doc, hits, activeId),
  };
}

type BibleStorage = {
  enabled: boolean;
  hover: HoverIntent | null;
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

function setState(editor: Editor, state: Omit<BibleRefHighlightState, "decorations">) {
  if (editor.isDestroyed) return;
  const next = withBibleDecorations(
    editor.state.doc,
    state.hits,
    state.activeId
  );
  const tr = editor.state.tr.setMeta(bibleRefHighlightKey, next);
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

  let decorations = value.decorations.map(tr.mapping, tr.doc);

  if (isAtomOnlyChange(tr.doc, changed.from, changed.to)) {
    const activeId = preserveBibleActiveId(value, mappedHits);
    if (activeId !== value.activeId) {
      return withBibleDecorations(tr.doc, mappedHits, activeId);
    }
    return { hits: mappedHits, activeId, decorations };
  }

  const bounds = bibleScanBounds(tr.doc, changed.from, changed.to);
  const kept = mappedHits.filter(
    (hit) => hit.to <= bounds.from || hit.from >= bounds.to
  );
  const fresh = collectBibleRefHitsInRange(tr.doc, bounds.from, bounds.to);
  const hits = [...kept, ...fresh].sort(
    (a, b) => a.from - b.from || a.to - b.to
  );
  const overlapping = decorations.find(bounds.from, bounds.to);
  if (overlapping.length > 0) {
    decorations = decorations.remove(overlapping);
  }
  if (fresh.length > 0) {
    decorations = decorations.add(
      tr.doc,
      fresh.map((hit) =>
        Decoration.inline(hit.from, hit.to, {
          class: "blogide-bible-ref",
          "data-bible-ref-id": hit.id,
        })
      )
    );
  }
  const activeId = preserveBibleActiveId(value, hits);
  if (activeId !== value.activeId) {
    return withBibleDecorations(tr.doc, hits, activeId);
  }
  return { hits, activeId, decorations };
}

function markFromEvent(event: Event): HTMLElement | null {
  const target = event.target;
  if (!(target instanceof Element)) return null;
  const mark = target.closest("[data-bible-ref-id]");
  return mark instanceof HTMLElement ? mark : null;
}

function bibleHover(editor: Editor): HoverIntent {
  const storage = editor.storage.bibleRefHighlight;
  if (!storage.hover) {
    storage.hover = createHoverIntent({
      onOpen: (id) => {
        if (!editor.isDestroyed) editor.commands.setBibleRefActive(id);
      },
      onClose: () => {
        if (!editor.isDestroyed) editor.commands.setBibleRefActive(null);
      },
    });
  }
  return storage.hover;
}

export const BibleRefHighlight = Extension.create({
  name: "bibleRefHighlight",

  addStorage() {
    return {
      enabled: false,
      hover: null,
    } satisfies BibleStorage;
  },

  addCommands() {
    return {
      setBibleRefsEnabled:
        (enabled: boolean) =>
        ({ editor }) => {
          const storage = editor.storage.bibleRefHighlight;
          storage.enabled = enabled;
          storage.hover?.dispose();
          storage.hover = null;
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
          bibleHover(editor).hold();
          return true;
        },
      releaseBibleRefCard:
        () =>
        ({ editor }) => {
          bibleHover(editor).leave();
          return true;
        },
    };
  },

  onDestroy() {
    const storage = this.editor.storage.bibleRefHighlight;
    storage.hover?.dispose();
    storage.hover = null;
  },

  addProseMirrorPlugins() {
    const extensionEditor = this.editor;
    return [
      new Plugin<BibleRefHighlightState>({
        key: bibleRefHighlightKey,
        state: {
          init: (_, state) => {
            if (!extensionEditor.storage.bibleRefHighlight.enabled) {
              return EMPTY;
            }
            const hits = scan(state.doc);
            return withBibleDecorations(state.doc, hits, null);
          },
          apply(tr, value) {
            const meta = tr.getMeta(bibleRefHighlightKey) as
              | BibleRefHighlightState
              | undefined;
            if (meta) {
              return meta.decorations
                ? meta
                : withBibleDecorations(tr.doc, meta.hits, meta.activeId);
            }
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
            return pluginState.decorations;
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
              bibleHover(extensionEditor).enter(id);
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
              bibleHover(extensionEditor).leave();
              return false;
            },
            wheel() {
              bibleHover(extensionEditor).cancelOpen();
              return false;
            },
          },
        },
      }),
    ];
  },
});
