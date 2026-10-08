"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/core";
import {
  findInEditor,
  replaceAllInEditor,
  matchesHaveMark,
  replaceMatch,
  toggleMarkOnMatches,
  type DocRange,
  type FindFormatMark,
} from "@/lib/editor/findReplaceInEditor";
import type { FindMatch, FindScope } from "@/lib/editor/findReplace";
import {
  clearFindHighlights,
  scrollMatchIntoView,
  setFindHighlights,
} from "@/lib/editor/findHighlight";
import {
  setFootnoteFindSession,
  syncFootnoteFindSession,
} from "@/lib/editor/footnoteFindBridge";
import {
  EDITOR_WORK_MS,
  cancelEditorWork,
  flushEditorWork,
  hasScheduledEditorWork,
  scheduleEditorWork,
} from "@/lib/editor/workSchedule";
import {
  insertIntoTextControl,
  setTextInsertTarget,
} from "@/lib/editor/textInsertTarget";

/** Max chars to seed Find from the current selection (single-line only). */
const SEED_QUERY_MAX_CHARS = 80;

/**
 * Queries this short match nearly everywhere in a long essay, so decorating
 * every hit per keystroke lags. Wait for a brief pause; longer queries are
 * selective enough to scan instantly.
 */
const SHORT_QUERY_MAX_CHARS = 2;
const QUERY_WORK_ID = "find-query";

type Props = {
  editor: Editor;
  onClose: () => void;
  /** Selection captured when Find was opened (survives focus loss). */
  initialStickyRange: DocRange | null;
  /** Incremented on each Ctrl+F / Find click to refocus the find field. */
  focusNonce?: number;
};

type ScanResult = {
  matches: FindMatch[];
  error: string | null;
};

function scan(
  editor: Editor,
  query: string,
  regex: boolean,
  caseSensitive: boolean,
  scope: FindScope,
  stickyRange: DocRange | null
): ScanResult {
  if (!query) return { matches: [], error: null };
  try {
    return {
      matches: findInEditor(
        editor,
        { query, regex, caseSensitive },
        scope,
        stickyRange
      ),
      error: null,
    };
  } catch (err) {
    return {
      matches: [],
      error: err instanceof Error ? err.message : "Invalid pattern",
    };
  }
}

function seedQueryFromSticky(
  editor: Editor,
  sticky: DocRange | null
): string {
  if (!sticky) return "";
  try {
    const text = editor.state.doc.textBetween(sticky.from, sticky.to, "\n");
    if (
      !text ||
      text.length > SEED_QUERY_MAX_CHARS ||
      text.includes("\n")
    ) {
      return "";
    }
    return text;
  } catch {
    return "";
  }
}

const FORMAT_BUTTONS: {
  mark: FindFormatMark;
  label: string;
  name: string;
  className: string;
}[] = [
  { mark: "bold", label: "B", name: "Bold", className: "is-bold" },
  { mark: "italic", label: "I", name: "Italic", className: "is-italic" },
  { mark: "strike", label: "S", name: "Strikethrough", className: "is-strike" },
];

/** Typing pause before Find opens a footnote card for the active match. */
const FOOTNOTE_CARD_TYPING_PAUSE_MS = 400;

export function FindReplacePanel({
  editor,
  onClose,
  initialStickyRange,
  focusNonce = 0,
}: Props) {
  const [query, setQuery] = useState(() =>
    seedQueryFromSticky(editor, initialStickyRange)
  );
  const [replacement, setReplacement] = useState("");
  const [regex, setRegex] = useState(false);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [scope, setScope] = useState<FindScope>(
    initialStickyRange ? "selection" : "document"
  );
  const [stickyRange, setStickyRange] = useState<DocRange | null>(
    initialStickyRange
  );
  const [matches, setMatches] = useState<FindMatch[]>([]);
  const [index, setIndex] = useState(0);
  /** Latest matches / index for the close handler (Escape listener is stable). */
  const closeStateRef = useRef({ matches: [] as FindMatch[], index: 0 });
  useEffect(() => {
    closeStateRef.current = { matches, index };
  }, [matches, index]);
  /** Pending footnote-card open while the query is still being typed. */
  const footnoteSyncTimerRef = useRef<number | null>(null);
  /** The writer clicked or typed in the essay after the last match was shown. */
  const userMovedRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  /** Format buttons act on every match, or only the current one. */
  const [formatTarget, setFormatTarget] = useState<"all" | "current">("all");
  const findInputRef = useRef<HTMLInputElement | null>(null);
  const replaceInputRef = useRef<HTMLInputElement | null>(null);
  const activeFieldRef = useRef<"find" | "replace">("find");
  const seededRef = useRef(query.length > 0);
  /**
   * Skip the `update` emitted by our own replace transactions so we can
   * re-scan with the adjusted sticky range. Highlight-only writes do not
   * emit `update` in TipTap (doc-only), so they must not set this flag —
   * that used to drop the next real keystroke and flicker decorations.
   */
  const ignoreNextUpdateRef = useRef(false);
  const scanArgsRef = useRef({
    query,
    regex,
    caseSensitive,
    scope,
    stickyRange,
    index,
  });
  scanArgsRef.current = {
    query,
    regex,
    caseSensitive,
    scope,
    stickyRange,
    index,
  };

  function focusFindField(select = true) {
    const field =
      activeFieldRef.current === "replace"
        ? replaceInputRef.current
        : findInputRef.current;
    field?.focus({ preventScroll: true });
    if (select && field === findInputRef.current) {
      field?.select();
    }
  }

  /**
   * Like Ctrl+F: if the essay has a non-empty selection when Find is focused,
   * adopt it as the sticky find-in-selection range (and seed a short query).
   */
  function adoptEditorSelectionIfAny() {
    const { from, to, empty } = editor.state.selection;
    if (empty) return;
    if (
      stickyRange &&
      stickyRange.from === from &&
      stickyRange.to === to &&
      scope === "selection"
    ) {
      return;
    }
    const nextSticky = { from, to };
    setStickyRange(nextSticky);
    setScope("selection");
    const seeded = seedQueryFromSticky(editor, nextSticky);
    if (seeded && seeded !== query) {
      setQuery(seeded);
      applyScan(seeded, regex, caseSensitive, "selection", nextSticky, {
        scroll: true,
        resetIndex: true,
      });
      return;
    }
    applyScan(query, regex, caseSensitive, "selection", nextSticky, {
      scroll: Boolean(query),
      resetIndex: true,
    });
  }

  /**
   * Open the footnote card for the active match. While the query is still
   * being typed, wait for a pause so cards don't flash open mid-word.
   * `openCard: false` only keeps an already-open card in sync.
   */
  function syncFootnoteCards(
    list: FindMatch[],
    at: number,
    opts: { query: string; regex: boolean; caseSensitive: boolean },
    typing: boolean,
    openCard = true
  ) {
    if (footnoteSyncTimerRef.current != null) {
      window.clearTimeout(footnoteSyncTimerRef.current);
      footnoteSyncTimerRef.current = null;
    }
    if (typing && list[at]?.footnotePos != null) {
      setFootnoteFindSession(null);
      footnoteSyncTimerRef.current = window.setTimeout(() => {
        footnoteSyncTimerRef.current = null;
        syncFootnoteFindSession(editor, list, at, opts);
      }, FOOTNOTE_CARD_TYPING_PAUSE_MS);
      return;
    }
    syncFootnoteFindSession(editor, list, at, opts, { openCard });
  }

  function applyScan(
    nextQuery: string,
    nextRegex: boolean,
    nextCase: boolean,
    nextScope: FindScope,
    nextSticky: DocRange | null,
    options?: {
      scroll?: boolean;
      /** Keep this index when possible (e.g. after Replace). */
      preferIndex?: number;
      /** Reset to the first match (default for new queries). */
      resetIndex?: boolean;
      /** Refocus the active find/replace field (default true). */
      focus?: boolean;
      /** Triggered by typing in the query (footnote cards wait for a pause). */
      typing?: boolean;
      /** Open the active match's footnote card (default true). */
      openFootnoteCard?: boolean;
    }
  ) {
    // Any scan supersedes a pending debounced one for a short query.
    cancelEditorWork(QUERY_WORK_ID);
    const sticky = nextScope === "selection" ? nextSticky : null;
    const result = scan(
      editor,
      nextQuery,
      nextRegex,
      nextCase,
      nextScope,
      sticky
    );
    let nextIndex = 0;
    if (result.matches.length > 0) {
      if (options?.preferIndex != null) {
        nextIndex = Math.min(
          options.preferIndex,
          result.matches.length - 1
        );
      } else if (options?.resetIndex === false) {
        nextIndex = Math.min(index, result.matches.length - 1);
      } else {
        nextIndex = 0;
      }
    }
    setMatches(result.matches);
    setError(result.error);
    setIndex(nextIndex);
    if (options?.scroll) userMovedRef.current = false;
    setFindHighlights(editor, result.matches, nextIndex, sticky);
    syncFootnoteCards(
      result.matches,
      nextIndex,
      { query: nextQuery, regex: nextRegex, caseSensitive: nextCase },
      Boolean(options?.typing),
      options?.openFootnoteCard !== false
    );
    if (options?.scroll && result.matches[nextIndex]) {
      scrollMatchIntoView(editor, result.matches[nextIndex]);
    }
    if (options?.focus !== false) {
      focusFindField(false);
    }
  }

  useEffect(() => {
    const sticky = initialStickyRange;
    if (sticky) {
      setFindHighlights(editor, [], 0, sticky);
    }
    if (seededRef.current) {
      // Selection was a short token — search it immediately inside the scope.
      applyScan(
        query,
        false,
        false,
        sticky ? "selection" : "document",
        sticky,
        { scroll: true, resetIndex: true, focus: false }
      );
    }
    focusFindField(true);
    return () => {
      cancelEditorWork(QUERY_WORK_ID);
      if (footnoteSyncTimerRef.current != null) {
        window.clearTimeout(footnoteSyncTimerRef.current);
      }
      clearFindHighlights(editor);
      setFootnoteFindSession(null);
      setTextInsertTarget(null);
    };
    // Mount-only bootstrap for seeded selection → query.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, initialStickyRange]);

  // Ctrl+F while Find is already open (same sticky key → no remount):
  // refocus the field and scroll to the first match. A new selection changes
  // the panel key and remounts, so sticky adoption happens in openFind/mount.
  const lastFocusNonceRef = useRef(focusNonce);
  useEffect(() => {
    if (lastFocusNonceRef.current === focusNonce) {
      return;
    }
    lastFocusNonceRef.current = focusNonce;
    focusFindField(true);
    const args = scanArgsRef.current;
    if (!args.query) return;
    // Defer so we do not setState synchronously inside this effect body.
    queueMicrotask(() => {
      applyScan(
        args.query,
        args.regex,
        args.caseSensitive,
        args.scope,
        args.stickyRange,
        { scroll: true, resetIndex: true, focus: false }
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusNonce]);

  useEffect(() => {
    setTextInsertTarget((payload) => {
      const active = document.activeElement;
      const find = findInputRef.current;
      const replace = replaceInputRef.current;
      const input =
        active === replace ? replace : active === find ? find : null;
      if (!input) return false;
      insertIntoTextControl(input, payload);
      return true;
    });
    return () => setTextInsertTarget(null);
  }, []);

  // Re-scan after typing settles. Mapped decorations stay during the wait.
  useEffect(() => {
    const workId = "find-rescan";
    function onEditorUpdate() {
      if (ignoreNextUpdateRef.current) {
        ignoreNextUpdateRef.current = false;
        return;
      }
      const args = scanArgsRef.current;
      if (!args.query) {
        setFindHighlights(
          editor,
          [],
          0,
          args.scope === "selection" ? args.stickyRange : null
        );
        setMatches([]);
        setIndex(0);
        return;
      }
      scheduleEditorWork(workId, EDITOR_WORK_MS.findRescan, () => {
        applyScan(
          args.query,
          args.regex,
          args.caseSensitive,
          args.scope,
          args.stickyRange,
          {
            scroll: false,
            preferIndex: args.index,
            focus: false,
            // An essay edit must not reopen a card the writer closed.
            openFootnoteCard: false,
          }
        );
      });
    }
    editor.on("update", onEditorUpdate);
    return () => {
      editor.off("update", onEditorUpdate);
      cancelEditorWork(workId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  useEffect(() => {
    const dom = editor.view.dom;
    const onUserMove = () => {
      userMovedRef.current = true;
    };
    dom.addEventListener("mousedown", onUserMove);
    dom.addEventListener("keydown", onUserMove);
    return () => {
      dom.removeEventListener("mousedown", onUserMove);
      dom.removeEventListener("keydown", onUserMove);
    };
  }, [editor]);

  /**
   * Close like Google Docs / VS Code: leave the cursor on the match you were
   * looking at (selected), without scrolling. If you clicked into the essay
   * since, keep that spot instead.
   */
  const closeFind = useCallback(() => {
    setFootnoteFindSession(null);
    const { matches: current, index: at } = closeStateRef.current;
    const match = current[at];
    if (!userMovedRef.current && match && match.footnotePos == null && !editor.isDestroyed) {
      editor
        .chain()
        .setTextSelection({ from: match.from, to: match.to })
        .focus(null, { scrollIntoView: false })
        .run();
    }
    onClose();
  }, [editor, onClose]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeFind();
      }
    }
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [closeFind]);

  function go(delta: number) {
    if (matches.length === 0) return;
    const next = (index + delta + matches.length) % matches.length;
    setIndex(next);
    userMovedRef.current = false;
    setFindHighlights(
      editor,
      matches,
      next,
      scope === "selection" ? stickyRange : null
    );
    syncFootnoteCards(matches, next, { query, regex, caseSensitive }, false);
    scrollMatchIntoView(editor, matches[next]);
    findInputRef.current?.focus({ preventScroll: true });
  }

  function doReplace() {
    if (matches.length === 0) return;
    const match = matches[index];
    ignoreNextUpdateRef.current = true;
    const delta = replaceMatch(editor, match, {
      query,
      replacement,
      regex,
      caseSensitive,
    });
    ignoreNextUpdateRef.current = false;
    let nextSticky = stickyRange;
    if (
      nextSticky &&
      match.footnotePos == null &&
      match.to <= nextSticky.to
    ) {
      nextSticky = {
        from: nextSticky.from,
        to: nextSticky.to + delta,
      };
      setStickyRange(nextSticky);
    }
    applyScan(query, regex, caseSensitive, scope, nextSticky, {
      scroll: true,
      preferIndex: index,
    });
  }

  function doReplaceAll() {
    ignoreNextUpdateRef.current = true;
    const result = replaceAllInEditor(
      editor,
      { query, replacement, regex, caseSensitive },
      scope,
      scope === "selection" ? stickyRange : null
    );
    ignoreNextUpdateRef.current = false;
    const nextSticky =
      scope === "selection" ? result.stickyRange : stickyRange;
    if (scope === "selection") {
      setStickyRange(nextSticky);
    }
    applyScan(query, regex, caseSensitive, scope, nextSticky, {
      scroll: false,
      resetIndex: true,
    });
  }

  function formatTargets(): FindMatch[] {
    if (formatTarget === "current") {
      return matches[index] ? [matches[index]] : [];
    }
    return matches;
  }

  /** Toggle a mark on the targeted matches (removes it if all have it). */
  function doFormat(mark: FindFormatMark) {
    const targets = formatTargets();
    if (targets.length === 0) return;
    ignoreNextUpdateRef.current = true;
    toggleMarkOnMatches(editor, targets, mark);
    ignoreNextUpdateRef.current = false;
    // Text is unchanged, so the same matches survive; re-scan to refresh
    // decorations and keep the current match.
    applyScan(query, regex, caseSensitive, scope, stickyRange, {
      scroll: false,
      preferIndex: index,
      openFootnoteCard: false,
    });
  }

  const formatTargetMatches = formatTargets();

  return (
    <div
      className="blogide-find-replace"
      role="dialog"
      aria-label="Find and replace"
    >
      <div className="blogide-find-replace-row">
        <input
          ref={findInputRef}
          type="search"
          value={query}
          onFocus={() => {
            activeFieldRef.current = "find";
            adoptEditorSelectionIfAny();
          }}
          onMouseDown={() => {
            // Capture essay selection before focus moves and collapses it.
            adoptEditorSelectionIfAny();
          }}
          onChange={(event) => {
            const next = event.target.value;
            setQuery(next);
            const run = () =>
              // Scroll to the first hit as the query changes (Chrome-like).
              applyScan(next, regex, caseSensitive, scope, stickyRange, {
                scroll: true,
                resetIndex: true,
                typing: true,
              });
            if (next.length > 0 && next.length <= SHORT_QUERY_MAX_CHARS) {
              scheduleEditorWork(
                QUERY_WORK_ID,
                EDITOR_WORK_MS.findShortQuery,
                run
              );
              return;
            }
            run();
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              if (hasScheduledEditorWork(QUERY_WORK_ID)) {
                // Enter during the short-query pause: scan now, land on hit 1.
                flushEditorWork(QUERY_WORK_ID);
                return;
              }
              if (matches.length === 0) {
                applyScan(query, regex, caseSensitive, scope, stickyRange, {
                  scroll: true,
                  resetIndex: true,
                });
                return;
              }
              if (event.shiftKey) {
                go(-1);
              } else {
                go(1);
              }
            }
          }}
          placeholder="Find"
          aria-label="Find"
          autoFocus
        />
        <input
          ref={replaceInputRef}
          type="text"
          value={replacement}
          onFocus={() => {
            activeFieldRef.current = "replace";
          }}
          onChange={(event) => setReplacement(event.target.value)}
          placeholder="Replace"
          aria-label="Replace"
        />
        <span className="blogide-find-replace-count">
          {matches.length === 0 ? "0" : `${index + 1}/${matches.length}`}
        </span>
        <button type="button" title="Previous (Shift+Enter)" onClick={() => go(-1)}>
          ↑
        </button>
        <button type="button" title="Next (Enter)" onClick={() => go(1)}>
          ↓
        </button>
        <button
          type="button"
          onClick={doReplace}
          disabled={matches.length === 0}
        >
          Replace
        </button>
        <button
          type="button"
          onClick={doReplaceAll}
          disabled={matches.length === 0}
        >
          All
        </button>
        <button
          type="button"
          className="blogide-find-replace-close"
          onClick={closeFind}
          aria-label="Close find"
        >
          ×
        </button>
      </div>
      <div className="blogide-find-replace-opts">
        <label>
          <input
            type="checkbox"
            checked={regex}
            onChange={(event) => {
              const next = event.target.checked;
              setRegex(next);
              applyScan(query, next, caseSensitive, scope, stickyRange, {
                scroll: true,
                resetIndex: true,
              });
            }}
          />{" "}
          Regex
        </label>
        <label>
          <input
            type="checkbox"
            checked={caseSensitive}
            onChange={(event) => {
              const next = event.target.checked;
              setCaseSensitive(next);
              applyScan(query, regex, next, scope, stickyRange, {
                scroll: true,
                resetIndex: true,
              });
            }}
          />{" "}
          Match case
        </label>
        <label className="blogide-find-scope-label">
          <span>Scope:</span>
          <select
            value={scope}
            onChange={(event) => {
              const next = event.target.value as FindScope;
              if (next === "selection") {
                let nextSticky = stickyRange;
                if (!nextSticky) {
                  const { from, to, empty } = editor.state.selection;
                  if (!empty) {
                    nextSticky = { from, to };
                    setStickyRange(nextSticky);
                  } else {
                    setError(
                      "Select text in the essay first for Selection scope."
                    );
                    setScope("document");
                    applyScan(query, regex, caseSensitive, "document", null, {
                      scroll: true,
                      resetIndex: true,
                    });
                    return;
                  }
                }
                setScope(next);
                applyScan(query, regex, caseSensitive, next, nextSticky, {
                  scroll: true,
                  resetIndex: true,
                });
                return;
              }
              setScope(next);
              applyScan(query, regex, caseSensitive, next, stickyRange, {
                scroll: true,
                resetIndex: true,
              });
            }}
          >
            <option value="document">Document</option>
            <option value="selection">Selection</option>
            <option value="headings">Headings only</option>
          </select>
        </label>
        <span
          className="blogide-find-format"
          role="group"
          aria-label="Format matches"
        >
          <span>Format:</span>
          {FORMAT_BUTTONS.map(({ mark, label, name, className }) => {
            const active = matchesHaveMark(editor, formatTargetMatches, mark);
            const target =
              formatTarget === "current" ? "the current match" : "all matches";
            return (
              <button
                key={mark}
                type="button"
                className={className}
                title={`${active ? "Remove" : "Apply"} ${name.toLowerCase()} on ${target}`}
                aria-label={`${name} ${target}`}
                aria-pressed={active}
                disabled={formatTargetMatches.length === 0}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => doFormat(mark)}
              >
                {label}
              </button>
            );
          })}
          <select
            value={formatTarget}
            aria-label="Format which matches"
            onChange={(event) =>
              setFormatTarget(event.target.value as "all" | "current")
            }
          >
            <option value="all">All matches</option>
            <option value="current">Current match</option>
          </select>
        </span>
        {scope === "selection" && stickyRange && (
          <span className="blogide-find-scope-hint">In selection</span>
        )}
        {error && <span className="blogide-find-replace-error">{error}</span>}
      </div>
    </div>
  );
}
