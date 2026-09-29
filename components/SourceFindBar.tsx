"use client";

import { useEffect, useRef } from "react";
import {
  insertIntoTextControl,
  setTextInsertTarget,
} from "@/lib/editor/textInsertTarget";

type Props = {
  query: string;
  onQueryChange: (next: string) => void;
  replacement: string;
  onReplacementChange: (next: string) => void;
  regex: boolean;
  onRegexChange: (next: boolean) => void;
  caseSensitive: boolean;
  onCaseSensitiveChange: (next: boolean) => void;
  matchCount: number;
  activeIndex: number;
  error: string | null;
  onStep: (delta: 1 | -1) => void;
  onReplace: () => void;
  onReplaceAll: () => void;
  onClose: () => void;
  /** Bumped on each Ctrl+F so the query field refocuses and selects. */
  focusNonce: number;
};

/**
 * Plain find/replace over the raw markdown in split view: no scopes, no
 * footnote cards — just the text in the source pane.
 */
export function SourceFindBar({
  query,
  onQueryChange,
  replacement,
  onReplacementChange,
  regex,
  onRegexChange,
  caseSensitive,
  onCaseSensitiveChange,
  matchCount,
  activeIndex,
  error,
  onStep,
  onReplace,
  onReplaceAll,
  onClose,
  focusNonce,
}: Props) {
  const findInputRef = useRef<HTMLInputElement | null>(null);
  const replaceInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const field = findInputRef.current;
    field?.focus({ preventScroll: true });
    field?.select();
  }, [focusNonce]);

  // Ω inserts go into whichever find field has focus.
  useEffect(() => {
    setTextInsertTarget((payload) => {
      const active = document.activeElement;
      const input =
        active === replaceInputRef.current
          ? replaceInputRef.current
          : active === findInputRef.current
            ? findInputRef.current
            : null;
      if (!input) return false;
      insertIntoTextControl(input, payload);
      return true;
    });
    return () => setTextInsertTarget(null);
  }, []);

  return (
    <div
      className="blogide-find-replace"
      role="dialog"
      aria-label="Find and replace in markdown"
    >
      <div className="blogide-find-replace-row">
        <input
          ref={findInputRef}
          type="search"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              onStep(event.shiftKey ? -1 : 1);
            }
          }}
          placeholder="Find in markdown"
          aria-label="Find in markdown"
        />
        <input
          ref={replaceInputRef}
          type="text"
          value={replacement}
          onChange={(event) => onReplacementChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              onReplace();
            }
          }}
          placeholder="Replace"
          aria-label="Replace"
        />
        <span className="blogide-find-replace-count" aria-live="polite">
          {matchCount === 0 ? "0" : `${activeIndex + 1}/${matchCount}`}
        </span>
        <button
          type="button"
          title="Previous (Shift+Enter)"
          aria-label="Previous match"
          onClick={() => onStep(-1)}
          disabled={matchCount === 0}
        >
          ↑
        </button>
        <button
          type="button"
          title="Next (Enter)"
          aria-label="Next match"
          onClick={() => onStep(1)}
          disabled={matchCount === 0}
        >
          ↓
        </button>
        <button
          type="button"
          title="Replace this match (Enter in the Replace field)"
          onClick={onReplace}
          disabled={matchCount === 0}
        >
          Replace
        </button>
        <button
          type="button"
          title="Replace every match (one Ctrl+Z undoes it)"
          onClick={onReplaceAll}
          disabled={matchCount === 0}
        >
          All
        </button>
        <button
          type="button"
          className="blogide-find-replace-close"
          onClick={onClose}
          aria-label="Close find"
          title="Close (Esc)"
        >
          ×
        </button>
      </div>
      <div className="blogide-find-replace-opts">
        <label>
          <input
            type="checkbox"
            checked={regex}
            onChange={(event) => onRegexChange(event.target.checked)}
          />{" "}
          Regex
        </label>
        <label>
          <input
            type="checkbox"
            checked={caseSensitive}
            onChange={(event) => onCaseSensitiveChange(event.target.checked)}
          />{" "}
          Match case
        </label>
        <span className="blogide-find-scope-hint">
          Searches the markdown source
        </span>
        {error && <span className="blogide-find-replace-error">{error}</span>}
      </div>
    </div>
  );
}
