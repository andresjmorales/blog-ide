"use client";

import { useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/core";
import {
  findInEditor,
  replaceAllInEditor,
  replaceMatch,
  type DocRange,
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
import { setTextInsertTarget } from "@/lib/editor/textInsertTarget";

/** Max chars to seed Find from the current selection (single-line only). */
const SEED_QUERY_MAX_CHARS = 80;

type Props = {
  editor: Editor;
  onClose: () => void;
  /** Selection captured when Find was opened (survives focus loss). */
  initialStickyRange: DocRange | null;
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

function insertIntoInput(
  input: HTMLInputElement,
  payload: { text: string; wrap?: { before: string; after: string } }
): void {
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? start;
  const selected = input.value.slice(start, end);
  const nextChunk = payload.wrap
    ? payload.wrap.before + (selected || "") + payload.wrap.after
    : payload.text;
  const value = input.value.slice(0, start) + nextChunk + input.value.slice(end);
  const nativeSetter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value"
  )?.set;
  nativeSetter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  const caret = payload.wrap
    ? start + payload.wrap.before.length + (selected ? selected.length : 0)
    : start + nextChunk.length;
  input.setSelectionRange(caret, caret);
  input.focus();
}

export function FindReplacePanel({
  editor,
  onClose,
  initialStickyRange,
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
  const [error, setError] = useState<string | null>(null);
  const findInputRef = useRef<HTMLInputElement | null>(null);
  const replaceInputRef = useRef<HTMLInputElement | null>(null);
  const activeFieldRef = useRef<"find" | "replace">("find");
  const seededRef = useRef(query.length > 0);

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
    }
  ) {
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
    setFindHighlights(editor, result.matches, nextIndex, sticky);
    syncFootnoteFindSession(editor, result.matches, nextIndex, {
      query: nextQuery,
      regex: nextRegex,
      caseSensitive: nextCase,
    });
    if (options?.scroll && result.matches[nextIndex]) {
      scrollMatchIntoView(editor, result.matches[nextIndex]);
    }
    const field =
      activeFieldRef.current === "replace"
        ? replaceInputRef.current
        : findInputRef.current;
    field?.focus();
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
        { scroll: true, resetIndex: true }
      );
    }
    findInputRef.current?.focus();
    findInputRef.current?.select();
    return () => {
      clearFindHighlights(editor);
      setFootnoteFindSession(null);
      setTextInsertTarget(null);
    };
    // Mount-only bootstrap for seeded selection → query.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, initialStickyRange]);

  useEffect(() => {
    setTextInsertTarget((payload) => {
      const active = document.activeElement;
      const find = findInputRef.current;
      const replace = replaceInputRef.current;
      const input =
        active === replace ? replace : active === find ? find : null;
      if (!input) return false;
      insertIntoInput(input, payload);
      return true;
    });
    return () => setTextInsertTarget(null);
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setFootnoteFindSession(null);
        onClose();
      }
    }
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  function go(delta: number) {
    if (matches.length === 0) return;
    const next = (index + delta + matches.length) % matches.length;
    setIndex(next);
    setFindHighlights(
      editor,
      matches,
      next,
      scope === "selection" ? stickyRange : null
    );
    syncFootnoteFindSession(editor, matches, next, {
      query,
      regex,
      caseSensitive,
    });
    scrollMatchIntoView(editor, matches[next]);
    findInputRef.current?.focus();
  }

  function doReplace() {
    if (matches.length === 0) return;
    const match = matches[index];
    const delta = replaceMatch(editor, match, {
      query,
      replacement,
      regex,
      caseSensitive,
    });
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
    const result = replaceAllInEditor(
      editor,
      { query, replacement, regex, caseSensitive },
      scope,
      scope === "selection" ? stickyRange : null
    );
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
            // Update highlights while typing, but do not scroll on every key —
            // that stacks smooth/instant jumps and feels broken.
            applyScan(next, regex, caseSensitive, scope, stickyRange, {
              scroll: false,
              resetIndex: true,
            });
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
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
        <button type="button" onClick={onClose} aria-label="Close find">
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
        {scope === "selection" && stickyRange && (
          <span className="blogide-find-scope-hint">In selection</span>
        )}
        {error && <span className="blogide-find-replace-error">{error}</span>}
      </div>
    </div>
  );
}
