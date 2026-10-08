"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type RefObject,
} from "react";
import {
  EditorContent,
  ReactNodeViewRenderer,
  useEditor,
} from "@tiptap/react";
import type { AnyExtension } from "@tiptap/core";
import { createExtensions } from "@/lib/editor/extensions";
import { isLossy, parseBody, previewRoundTrip } from "@/lib/markdown/pipeline";
import { compactDiff, unifiedLineDiff } from "@/lib/markdown/diff";
import { splitFrontmatter } from "@/lib/markdown/frontmatter";
import {
  fileNameToTitle,
  parseTitle,
} from "@/lib/markdown/titleFrontmatter";
import { parseSubtitle } from "@/lib/markdown/subtitle";
import {
  findMatchesInText,
  replaceAllInText,
  replacementAt,
  type FindMatch,
} from "@/lib/editor/findReplace";
import {
  isFindHotkeyTarget,
  isFindReplaceHotkey,
} from "@/lib/editor/findHotkey";
import { replaceTextControlRange } from "@/lib/editor/textInsertTarget";
import { buildSourceMirrorHtml } from "@/lib/editor/sourceMirror";
import {
  blockKey,
  mapScroll,
  matchBlocksToLines,
  normalizeAnchors,
  previewBlocks,
  previewBlockText,
  type ScrollAnchor,
} from "@/lib/editor/splitScrollSync";
import { useEditorPrefs } from "@/components/EditorPrefsContext";
import { DEFAULT_EDITOR_PREFS } from "@/lib/settings";
import { FootnotePreviewNodeView } from "@/components/FootnotePreviewNodeView";
import { EndnotesSection } from "@/components/EndnotesSection";
import { ImageCaptionNodeView } from "@/components/ImageCaptionNodeView";
import {
  BlockMathNodeView,
  InlineMathNodeView,
} from "@/components/MathNodeView";
import { SourceFindBar } from "@/components/SourceFindBar";
import { SearchIcon } from "@/components/icons";

/** Preview-safe node views: numbered footnote blobs, images, KaTeX — no cards. */
function withPreviewNodeViews(extension: AnyExtension): AnyExtension {
  if (extension.name === "footnoteRef") {
    return extension.extend({
      addNodeView() {
        return ReactNodeViewRenderer(FootnotePreviewNodeView);
      },
    });
  }
  if (extension.name === "image") {
    return extension.extend({
      addNodeView() {
        return ReactNodeViewRenderer(ImageCaptionNodeView);
      },
    });
  }
  if (extension.name === "inlineMath") {
    return extension.extend({
      addNodeView() {
        return ReactNodeViewRenderer(InlineMathNodeView);
      },
    });
  }
  if (extension.name === "blockMath") {
    return extension.extend({
      addNodeView() {
        return ReactNodeViewRenderer(BlockMathNodeView);
      },
    });
  }
  return extension;
}

const PREVIEW_DEBOUNCE_MS = 180;
const MIN_PANE = 220;
const MAX_PANE = 900;
/** Dragging the gutter never squeezes the preview below this. */
const MIN_PREVIEW = 240;
/** Arrow-key step on the focused gutter (Shift for a bigger one). */
const KEY_STEP = 24;
/** Below md the panes don't fit side by side: one at a time, with a toggle. */
const NARROW_QUERY = "(max-width: 767px)";

function subscribeNarrow(onChange: () => void) {
  const media = window.matchMedia(NARROW_QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

function useNarrowViewport() {
  return useSyncExternalStore(
    subscribeNarrow,
    () => window.matchMedia(NARROW_QUERY).matches,
    () => false
  );
}

/** Widest the source pane may be while leaving the preview usable. */
function maxPaneFor(containerWidth: number) {
  return Math.max(
    MIN_PANE,
    Math.min(MAX_PANE, containerWidth ? containerWidth - MIN_PREVIEW : MAX_PANE)
  );
}
/** Max chars to seed Find from the markdown selection (single-line only). */
const SEED_QUERY_MAX_CHARS = 80;

type Pane = "source" | "preview";

/**
 * Where the active match sits: a fixed index (after ↑/↓), or "first match
 * at/after this offset" (new query, after Replace) so Find starts near the
 * caret instead of jumping to the top.
 */
type FindCursor = { index: number } | { from: number };

type Props = {
  sourceText: string;
  onSourceChange: (next: string) => void;
  toolbarExtra?: React.ReactNode;
  shellDock?: React.ReactNode;
  spellcheckEnabled?: boolean;
  spellcheckLang?: string;
  /** Fallback title when frontmatter has none. */
  documentName?: string | null;
  sourceTextareaRef?: RefObject<HTMLTextAreaElement | null>;
};

function unpackPreviewMeta(
  markdown: string,
  fallbackFileName?: string | null
) {
  const { frontmatter, body } = splitFrontmatter(markdown);
  return {
    title:
      parseTitle(frontmatter) ||
      (fallbackFileName ? fileNameToTitle(fallbackFileName) : "Untitled"),
    subtitle: parseSubtitle(frontmatter) || "",
    body,
  };
}

/** Textarea + mirror share these so soft wraps land on the same pixels. */
const SOURCE_TEXT_CLASS =
  "px-4 py-4 font-mono text-sm leading-relaxed [scrollbar-gutter:stable]";

/**
 * Markdown-canonical split: editable source | debounced read-only TipTap preview.
 * Preview never writes back into the buffer. On narrow screens the panes
 * stack and a Markdown / Preview toggle shows one at a time; the hidden one
 * keeps its layout so scroll sync lands the other on the same spot.
 *
 * Behind the textarea sits a transparent mirror of its text: it paints Find
 * highlights and tells scroll sync where each source line lands.
 */
export function MarkdownSplitView({
  sourceText,
  onSourceChange,
  toolbarExtra,
  shellDock,
  spellcheckEnabled = false,
  spellcheckLang = "en",
  documentName = null,
  sourceTextareaRef,
}: Props) {
  const { prefs, updatePrefs } = useEditorPrefs();
  const syncScroll = prefs.markdownSplitSyncScroll ?? true;
  /** While dragging the gutter; otherwise width comes from prefs. */
  const [dragWidth, setDragWidth] = useState<number | null>(null);
  const [previewMd, setPreviewMd] = useState(sourceText);
  const [normOpen, setNormOpen] = useState(false);
  const dragRef = useRef<{ startX: number; startW: number; maxW: number } | null>(
    null
  );
  const debounceRef = useRef(0);
  const narrow = useNarrowViewport();
  const [narrowPane, setNarrowPane] = useState<Pane>("source");
  /** Panes row width, so a saved width never crowds the preview out. */
  const [panesWidth, setPanesWidth] = useState(0);
  const paneWidth = Math.min(
    dragWidth ?? prefs.markdownSplitWidth,
    maxPaneFor(panesWidth)
  );

  const rootRef = useRef<HTMLDivElement | null>(null);
  const panesRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const mirrorRef = useRef<HTMLDivElement | null>(null);
  const previewScrollRef = useRef<HTMLDivElement | null>(null);

  const setTextareaRef = useCallback(
    (node: HTMLTextAreaElement | null) => {
      textareaRef.current = node;
      if (sourceTextareaRef) sourceTextareaRef.current = node;
    },
    [sourceTextareaRef]
  );

  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      debounceRef.current = 0;
      setPreviewMd(sourceText);
    }, PREVIEW_DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [sourceText]);

  // Round-trip checks re-parse the whole essay: once per settled preview,
  // not on every keystroke re-render.
  const meta = useMemo(
    () => unpackPreviewMeta(previewMd, documentName),
    [previewMd, documentName]
  );
  const lossy = useMemo(() => isLossy(previewMd), [previewMd]);
  const lossyDiffLines = useMemo(
    () =>
      lossy && normOpen
        ? compactDiff(unifiedLineDiff(previewMd, previewRoundTrip(previewMd)), 2)
        : [],
    [lossy, normOpen, previewMd]
  );

  // Read-only preview: typing prefs only change input rules, so one stable
  // extension set (and no per-render option churn inside useEditor).
  const extensions = useMemo(
    () => createExtensions().map(withPreviewNodeViews),
    []
  );
  const editor = useEditor(
    {
      extensions,
      editable: false,
      immediatelyRender: false,
      editorProps: {
        attributes: {
          class: "editor-prose outline-none min-h-[40vh]",
          "aria-label": "Markdown preview",
        },
      },
    },
    [extensions]
  );

  // ---------------------------------------------------------------- find

  const [findOpen, setFindOpen] = useState(false);
  const [findFocusNonce, setFindFocusNonce] = useState(0);
  const [query, setQuery] = useState("");
  const [replacement, setReplacement] = useState("");
  const [regex, setRegex] = useState(false);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [findCursor, setFindCursor] = useState<FindCursor>({ index: 0 });
  /** Bumped when the active match should be scrolled into view. */
  const [revealNonce, setRevealNonce] = useState(0);
  const findOriginRef = useRef(0);

  const findResult = useMemo((): {
    matches: FindMatch[];
    error: string | null;
  } => {
    if (!findOpen || !query) return { matches: [], error: null };
    if (regex) {
      try {
        new RegExp(query);
      } catch (err) {
        return {
          matches: [],
          error: err instanceof Error ? err.message : "Invalid pattern",
        };
      }
    }
    return {
      matches: findMatchesInText(sourceText, { query, regex, caseSensitive }),
      error: null,
    };
  }, [findOpen, query, regex, caseSensitive, sourceText]);
  const matches = findResult.matches;

  const activeIndex = useMemo(() => {
    if (matches.length === 0) return 0;
    if ("from" in findCursor) {
      const at = matches.findIndex((match) => match.from >= findCursor.from);
      return at < 0 ? 0 : at;
    }
    return Math.min(findCursor.index, matches.length - 1);
  }, [matches, findCursor]);

  const mirrorHtml = useMemo(
    () =>
      findOpen ? buildSourceMirrorHtml(sourceText, matches, activeIndex) : null,
    [findOpen, sourceText, matches, activeIndex]
  );

  useLayoutEffect(() => {
    const mirror = mirrorRef.current;
    const textarea = textareaRef.current;
    if (!mirror || !textarea) return;
    // Closed: drop the highlights. Scroll sync refreshes the text itself.
    mirror.innerHTML = mirrorHtml ?? buildSourceMirrorHtml(textarea.value);
    mirror.scrollTop = textarea.scrollTop;
  }, [mirrorHtml]);

  const handledRevealRef = useRef(0);
  useLayoutEffect(() => {
    if (handledRevealRef.current === revealNonce) return;
    handledRevealRef.current = revealNonce;
    const textarea = textareaRef.current;
    const mirror = mirrorRef.current;
    const match = matches[activeIndex];
    if (!textarea || !mirror || !match) return;
    // Selected now so closing Find (or clicking back in) lands on it.
    textarea.setSelectionRange(match.from, match.to);
    const mark = mirror.querySelector<HTMLElement>("mark.is-current");
    if (!mark) return;
    const top = mark.offsetTop;
    const bottom = top + mark.offsetHeight;
    if (
      top < textarea.scrollTop + 8 ||
      bottom > textarea.scrollTop + textarea.clientHeight - 8
    ) {
      textarea.scrollTop = Math.max(0, top - textarea.clientHeight / 3);
    }
  }, [revealNonce, mirrorHtml, matches, activeIndex]);

  function showNarrowPane(pane: Pane) {
    // A hidden textarea can keep focus (and the phone keyboard) otherwise.
    if (pane === "preview") textareaRef.current?.blur();
    setNarrowPane(pane);
  }

  function openFind() {
    // Find works on the markdown, so show it on phones.
    setNarrowPane("source");
    const textarea = textareaRef.current;
    if (textarea) {
      findOriginRef.current = textarea.selectionStart;
      if (document.activeElement === textarea) {
        const selected = textarea.value.slice(
          textarea.selectionStart,
          textarea.selectionEnd
        );
        if (
          selected &&
          selected.length <= SEED_QUERY_MAX_CHARS &&
          !selected.includes("\n")
        ) {
          setQuery(selected);
        }
      }
    }
    setFindCursor({ from: findOriginRef.current });
    setFindOpen(true);
    setFindFocusNonce((n) => n + 1);
    setRevealNonce((n) => n + 1);
  }

  function closeFind() {
    const textarea = textareaRef.current;
    const match = matches[activeIndex];
    setFindOpen(false);
    // Esc while typing in the markdown just closes; selecting the match
    // there would let the next keystroke overwrite it.
    if (!textarea || document.activeElement === textarea) return;
    textarea.focus({ preventScroll: true });
    if (match) textarea.setSelectionRange(match.from, match.to);
  }

  function stepFind(delta: 1 | -1) {
    if (matches.length === 0) return;
    setFindCursor({
      index: (activeIndex + delta + matches.length) % matches.length,
    });
    setRevealNonce((n) => n + 1);
  }

  /** Replace edits steal focus into the textarea; hand it back to Find. */
  function withFindFocusKept(run: () => void) {
    const back = document.activeElement;
    run();
    if (back instanceof HTMLElement && back !== textareaRef.current) {
      back.focus({ preventScroll: true });
    }
  }

  function replaceCurrent() {
    const textarea = textareaRef.current;
    const match = matches[activeIndex];
    if (!textarea || !match) return;
    const next = replacementAt(textarea.value, match.from, {
      query,
      replacement,
      regex,
      caseSensitive,
    });
    if (!next) return;
    withFindFocusKept(() =>
      replaceTextControlRange(textarea, match.from, next.to, next.text)
    );
    setFindCursor({ from: match.from + next.text.length });
    setRevealNonce((n) => n + 1);
  }

  function replaceAll() {
    const textarea = textareaRef.current;
    if (!textarea || matches.length === 0) return;
    const current = textarea.value;
    const next = replaceAllInText(current, {
      query,
      replacement,
      regex,
      caseSensitive,
    });
    if (next === current) return;
    // One edit over the changed span: a single Ctrl+Z restores everything.
    let start = 0;
    while (
      start < current.length &&
      start < next.length &&
      current[start] === next[start]
    ) {
      start += 1;
    }
    let endCurrent = current.length;
    let endNext = next.length;
    while (
      endCurrent > start &&
      endNext > start &&
      current[endCurrent - 1] === next[endNext - 1]
    ) {
      endCurrent -= 1;
      endNext -= 1;
    }
    withFindFocusKept(() =>
      replaceTextControlRange(
        textarea,
        start,
        endCurrent,
        next.slice(start, endNext)
      )
    );
    setFindCursor({ index: 0 });
  }

  const openFindRef = useRef(openFind);
  const closeFindRef = useRef(closeFind);
  const findOpenRef = useRef(findOpen);
  useEffect(() => {
    openFindRef.current = openFind;
    closeFindRef.current = closeFind;
    findOpenRef.current = findOpen;
  });

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const root = rootRef.current;
      if (isFindReplaceHotkey(event)) {
        // Markdown, preview, the find bar itself — not AI / explorer inputs.
        if (!isFindHotkeyTarget(event.target, root)) return;
        event.preventDefault();
        openFindRef.current();
        return;
      }
      if (
        event.key === "Escape" &&
        findOpenRef.current &&
        event.target instanceof Node &&
        root?.contains(event.target)
      ) {
        event.preventDefault();
        closeFindRef.current();
      }
    }
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, []);

  // --------------------------------------------------------- scroll sync

  const anchorsRef = useRef<ScrollAnchor[]>([]);
  /** scrollTop we just set on a pane, so its echo scroll event is ignored. */
  const echoRef = useRef<Record<Pane, number | null>>({
    source: null,
    preview: null,
  });
  /** The pane the writer last scrolled; content reflows re-sync from it. */
  const leaderRef = useRef<Pane>("source");
  const syncFrameRef = useRef(0);
  const refreshFrameRef = useRef(0);
  const syncScrollRef = useRef(syncScroll);
  useEffect(() => {
    syncScrollRef.current = syncScroll;
  }, [syncScroll]);

  const paneElement = useCallback(
    (pane: Pane): HTMLElement | null =>
      pane === "source" ? textareaRef.current : previewScrollRef.current,
    []
  );

  const syncFrom = useCallback(
    (pane: Pane) => {
      if (!syncScrollRef.current) return;
      const other: Pane = pane === "source" ? "preview" : "source";
      const from = paneElement(pane);
      const to = paneElement(other);
      if (!from || !to) return;
      const fromMax = from.scrollHeight - from.clientHeight;
      const toMax = to.scrollHeight - to.clientHeight;
      if (fromMax <= 0 || toMax <= 0) return;
      // Track a reading line that slides from the viewport top (at the
      // start) to its bottom (at the end), so both panes reach their ends
      // together instead of one stalling short.
      const ratio = from.scrollTop / fromMax;
      const probe = from.scrollTop + from.clientHeight * ratio;
      const mapped = mapScroll(anchorsRef.current, probe, pane);
      const target = mapped / (1 + to.clientHeight / toMax);
      const clamped = Math.round(Math.max(0, Math.min(toMax, target)));
      if (Math.abs(to.scrollTop - clamped) < 1) return;
      echoRef.current[other] = clamped;
      to.scrollTop = clamped;
    },
    [paneElement]
  );

  const refreshAnchors = useCallback(() => {
    const textarea = textareaRef.current;
    const mirror = mirrorRef.current;
    const scroller = previewScrollRef.current;
    const proseRoot =
      editor && !editor.isDestroyed ? editor.view.dom : null;
    if (!textarea || !mirror || !scroller || !(proseRoot instanceof Element)) {
      return;
    }
    // Open Find keeps the mirror current; otherwise bring its text up to date.
    if (!findOpenRef.current) {
      mirror.innerHTML = buildSourceMirrorHtml(textarea.value);
    }
    mirror.scrollTop = textarea.scrollTop;

    const text = textarea.value;
    const lines = text.split("\n");
    const bodyStartLine =
      splitFrontmatter(text).frontmatter.split("\n").length - 1;
    const blocks = previewBlocks(proseRoot);
    const hits = matchBlocksToLines(
      blocks.map((block) => blockKey(previewBlockText(block))),
      lines,
      Math.max(0, bodyStartLine)
    );
    const lineTops = new Map<number, number>();
    mirror
      .querySelectorAll<HTMLElement>("span[data-l]")
      .forEach((marker) =>
        lineTops.set(Number(marker.dataset.l), marker.offsetTop)
      );
    const origin =
      scroller.getBoundingClientRect().top - scroller.scrollTop;
    const anchors: ScrollAnchor[] = [];
    blocks.forEach((block, index) => {
      const line = hits[index];
      if (line == null) return;
      const source = lineTops.get(line);
      if (source == null) return;
      anchors.push({
        source,
        preview: block.getBoundingClientRect().top - origin,
      });
    });
    anchorsRef.current = normalizeAnchors(
      anchors,
      textarea.scrollHeight,
      scroller.scrollHeight
    );
  }, [editor]);

  const scheduleRefresh = useCallback(() => {
    if (!syncScrollRef.current) return;
    cancelAnimationFrame(refreshFrameRef.current);
    refreshFrameRef.current = requestAnimationFrame(() => {
      refreshAnchors();
      syncFrom(leaderRef.current);
    });
  }, [refreshAnchors, syncFrom]);

  function onPaneScroll(pane: Pane) {
    const el = paneElement(pane);
    if (!el) return;
    if (pane === "source" && mirrorRef.current) {
      mirrorRef.current.scrollTop = el.scrollTop;
    }
    const echo = echoRef.current[pane];
    if (echo != null) {
      echoRef.current[pane] = null;
      if (Math.abs(el.scrollTop - echo) <= 2) return;
    }
    leaderRef.current = pane;
    if (!syncScrollRef.current) return;
    cancelAnimationFrame(syncFrameRef.current);
    syncFrameRef.current = requestAnimationFrame(() => syncFrom(pane));
  }

  useEffect(() => {
    if (!editor) return;
    let cancelled = false;
    // Out of the effect: React node views (KaTeX, footnotes) flushSync on
    // mount, which React rejects mid-commit.
    queueMicrotask(() => {
      if (cancelled || editor.isDestroyed) return;
      editor.commands.setContent(parseBody(meta.body), { emitUpdate: false });
      scheduleRefresh();
    });
    return () => {
      cancelled = true;
    };
  }, [editor, meta.body, scheduleRefresh]);

  // KaTeX, images, and pane-width changes all move lines after the fact.
  useEffect(() => {
    if (!editor || editor.isDestroyed || !syncScroll) return;
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => scheduleRefresh());
    const proseRoot = editor.view.dom;
    if (proseRoot instanceof Element) observer.observe(proseRoot);
    if (textareaRef.current) observer.observe(textareaRef.current);
    scheduleRefresh();
    return () => observer.disconnect();
  }, [editor, syncScroll, scheduleRefresh]);

  useEffect(
    () => () => {
      cancelAnimationFrame(syncFrameRef.current);
      cancelAnimationFrame(refreshFrameRef.current);
    },
    []
  );

  // ------------------------------------------------------------- resize

  useEffect(() => {
    const panes = panesRef.current;
    if (!panes || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() =>
      setPanesWidth(panes.clientWidth)
    );
    observer.observe(panes);
    return () => observer.disconnect();
  }, []);

  function onSeparatorKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const step = event.shiftKey ? KEY_STEP * 4 : KEY_STEP;
    const maxW = maxPaneFor(panesWidth);
    let next: number;
    if (event.key === "ArrowLeft") next = paneWidth - step;
    else if (event.key === "ArrowRight") next = paneWidth + step;
    else if (event.key === "Home") next = MIN_PANE;
    else if (event.key === "End") next = maxW;
    else return;
    event.preventDefault();
    updatePrefs({
      markdownSplitWidth: Math.min(maxW, Math.max(MIN_PANE, next)),
    });
  }

  function beginResize(event: React.PointerEvent<HTMLDivElement>) {
    event.preventDefault();
    const maxW = maxPaneFor(panesRef.current?.clientWidth ?? 0);
    dragRef.current = { startX: event.clientX, startW: paneWidth, maxW };
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);

    function widthAt(clientX: number) {
      const drag = dragRef.current;
      if (!drag) return paneWidth;
      return Math.min(
        drag.maxW,
        Math.max(MIN_PANE, drag.startW + (clientX - drag.startX))
      );
    }
    function onMove(e: PointerEvent) {
      if (!dragRef.current) return;
      setDragWidth(widthAt(e.clientX));
    }
    function finish(e: PointerEvent) {
      const next = widthAt(e.clientX);
      dragRef.current = null;
      if (target.hasPointerCapture(e.pointerId)) {
        target.releasePointerCapture(e.pointerId);
      }
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      if (e.type === "pointerup") updatePrefs({ markdownSplitWidth: next });
      setDragWidth(null);
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
  }

  const headerButton =
    "inline-flex h-7 items-center gap-1 rounded px-2 text-xs text-muted hover:bg-panel hover:text-foreground";

  return (
    <div ref={rootRef} className="flex h-full flex-col">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-3 py-1.5">
        <span className="flex min-w-0 items-center gap-2">
          {narrow ? (
            <span
              role="tablist"
              aria-label="Split view pane"
              className="inline-flex rounded border border-border p-0.5"
            >
              {(["source", "preview"] as const).map((pane) => (
                <button
                  key={pane}
                  type="button"
                  role="tab"
                  aria-selected={narrowPane === pane}
                  onClick={() => showNarrowPane(pane)}
                  className={`h-6 rounded-sm px-2.5 text-xs ${
                    narrowPane === pane
                      ? "bg-accent/15 text-accent"
                      : "text-muted hover:text-foreground"
                  }`}
                >
                  {pane === "source" ? "Markdown" : "Preview"}
                </button>
              ))}
            </span>
          ) : (
            <span className="text-xs font-mono uppercase tracking-wider text-muted">
              Markdown · preview
            </span>
          )}
          {lossy && (
            // Inline (not a banner) so it can't shove the textarea down
            // mid-keystroke when a half-typed `*` briefly normalizes.
            <button
              type="button"
              onClick={() => setNormOpen((open) => !open)}
              aria-expanded={normOpen}
              title="The preview shows a normalized form of this markdown. Click to see what changes."
              className="rounded border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[0.7rem]"
            >
              Normalized {normOpen ? "▴" : "▾"}
            </button>
          )}
        </span>
        <span className="flex items-center gap-1">
          <button
            type="button"
            aria-pressed={syncScroll}
            title={
              syncScroll
                ? "Scroll sync on: both panes follow each other"
                : "Scroll sync off: panes scroll independently"
            }
            onClick={() =>
              updatePrefs({ markdownSplitSyncScroll: !syncScroll })
            }
            className={`${headerButton} ${
              syncScroll ? "bg-accent/15 text-accent" : ""
            }`}
          >
            ⇅ Sync
          </button>
          <button
            type="button"
            title="Find in markdown (Ctrl+F)"
            aria-label="Find in markdown"
            onClick={() => openFind()}
            className={`${headerButton} ${
              findOpen ? "bg-accent/15 text-accent" : ""
            }`}
          >
            <SearchIcon className="blogide-tool-icon" />
          </button>
          {toolbarExtra}
        </span>
      </div>

      {lossy && normOpen && (
        <div className="border-b border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm">
          <pre className="lossy-diff max-h-56 overflow-auto rounded border border-border bg-background p-2 font-mono text-[0.7rem] leading-snug">
            {lossyDiffLines.length === 0 ? (
              <span className="text-muted">
                No line-level changes detected.
              </span>
            ) : (
              lossyDiffLines.map((line, index) => (
                <div
                  key={`${line.type}-${index}`}
                  className={
                    line.type === "add"
                      ? "lossy-diff-add"
                      : line.type === "remove"
                        ? "lossy-diff-remove"
                        : "text-muted"
                  }
                >
                  {line.type === "add"
                    ? `+ ${line.text}`
                    : line.type === "remove"
                      ? `- ${line.text}`
                      : `  ${line.text}`}
                </div>
              ))
            )}
          </pre>
        </div>
      )}

      {findOpen && (
        <SourceFindBar
          query={query}
          onQueryChange={(next) => {
            setQuery(next);
            setFindCursor({ from: findOriginRef.current });
            setRevealNonce((n) => n + 1);
          }}
          replacement={replacement}
          onReplacementChange={setReplacement}
          regex={regex}
          onRegexChange={(next) => {
            setRegex(next);
            setFindCursor({ from: findOriginRef.current });
            setRevealNonce((n) => n + 1);
          }}
          caseSensitive={caseSensitive}
          onCaseSensitiveChange={(next) => {
            setCaseSensitive(next);
            setFindCursor({ from: findOriginRef.current });
            setRevealNonce((n) => n + 1);
          }}
          matchCount={matches.length}
          activeIndex={activeIndex}
          error={findResult.error}
          onStep={stepFind}
          onReplace={replaceCurrent}
          onReplaceAll={replaceAll}
          onClose={closeFind}
          focusNonce={findFocusNonce}
        />
      )}

      <div ref={panesRef} className="relative flex min-h-0 flex-1">
        <div
          className={`flex min-h-0 shrink-0 flex-col ${
            narrow
              ? `absolute inset-0 ${narrowPane === "source" ? "" : "invisible"}`
              : "relative border-r border-border"
          }`}
          style={narrow ? undefined : { width: paneWidth }}
        >
          <div
            ref={mirrorRef}
            aria-hidden
            className={`source-mirror pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap break-words text-transparent ${SOURCE_TEXT_CLASS}`}
          />
          <textarea
            ref={setTextareaRef}
            value={sourceText}
            onChange={(e) => onSourceChange(e.target.value)}
            onScroll={() => onPaneScroll("source")}
            spellCheck={spellcheckEnabled}
            lang={spellcheckLang}
            aria-label="Markdown source"
            className={`relative min-h-0 w-full flex-1 resize-none bg-transparent outline-none ${SOURCE_TEXT_CLASS}`}
          />
        </div>
        {!narrow && (
          <div
            role="separator"
            tabIndex={0}
            aria-orientation="vertical"
            aria-label="Resize markdown pane"
            aria-valuemin={MIN_PANE}
            aria-valuemax={maxPaneFor(panesWidth)}
            aria-valuenow={Math.round(paneWidth)}
            title="Drag to resize · double-click to reset"
            onPointerDown={beginResize}
            onDoubleClick={() =>
              updatePrefs({ markdownSplitWidth: DEFAULT_EDITOR_PREFS.markdownSplitWidth })
            }
            onKeyDown={onSeparatorKeyDown}
            className="relative w-1.5 shrink-0 cursor-col-resize touch-none outline-none hover:bg-accent/40 focus-visible:bg-accent/40"
          >
            {/* Wider invisible hit area than the visible line. */}
            <span className="absolute inset-y-0 -left-1.5 -right-1.5" />
          </div>
        )}
        <div
          ref={previewScrollRef}
          onScroll={() => onPaneScroll("preview")}
          className={`min-h-0 min-w-0 flex-1 overflow-y-auto ${
            narrow
              ? `absolute inset-0 ${narrowPane === "preview" ? "" : "invisible"}`
              : ""
          }`}
        >
          <div className="mx-auto max-w-2xl px-6 py-10">
            <div className="essay-title-block pointer-events-none select-text">
              <div className="essay-title-input" aria-hidden>
                {meta.title}
              </div>
              {meta.subtitle ? (
                <div className="essay-subtitle-input" aria-hidden>
                  {meta.subtitle}
                </div>
              ) : null}
            </div>
            <EditorContent editor={editor} />
            {/* The preview has no margin rail, so notes always list below —
                otherwise edits to `[^n]:` definitions never show up. */}
            {editor && (
              <EndnotesSection
                editor={editor}
                expanded={prefs.endnotesExpanded ?? true}
                onExpandedChange={(next) =>
                  updatePrefs({ endnotesExpanded: next })
                }
                preview
              />
            )}
          </div>
        </div>
      </div>
      {shellDock}
    </div>
  );
}
