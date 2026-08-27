"use client";

import { useCallback, useRef, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import type { Editor } from "@tiptap/core";
import { useEditorPrefs } from "@/components/EditorPrefsContext";
import { addHarperDictionaryWord } from "@/lib/editor/harper/dictionary";
import {
  harperKindLabel,
  isHarperSpellingKind,
} from "@/lib/editor/harper/kinds";
import { getHarperState } from "@/lib/editor/harper/HarperHighlight";
import {
  suggestionLabel,
  suggestionsKey,
} from "@/lib/editor/harper/suggestions";
import type { HarperIssue } from "@/lib/editor/harper/types";
import { claimFloatZ } from "@/lib/pins/pinStore";

type Props = {
  editor: Editor | null;
};

type CardModel = {
  issue: HarperIssue;
  left: number;
  top: number;
  zIndex: number;
};

function sameCard(a: CardModel | null, b: CardModel | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.issue.id === b.issue.id &&
    a.left === b.left &&
    a.top === b.top &&
    a.zIndex === b.zIndex &&
    a.issue.message === b.issue.message &&
    suggestionsKey(a.issue.suggestions) === suggestionsKey(b.issue.suggestions)
  );
}

export function HarperLintCard({ editor }: Props) {
  const { prefs, updatePrefs } = useEditorPrefs();
  const cacheRef = useRef<CardModel | null>(null);

  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      if (!editor) return () => {};
      const sync = () => onStoreChange();
      editor.on("transaction", sync);
      window.addEventListener("resize", sync);
      return () => {
        editor.off("transaction", sync);
        window.removeEventListener("resize", sync);
      };
    },
    [editor]
  );

  const getSnapshot = useCallback((): CardModel | null => {
    if (!editor || editor.isDestroyed) {
      cacheRef.current = null;
      return null;
    }
    const state = getHarperState(editor);
    if (!state.activeId) {
      cacheRef.current = null;
      return null;
    }
    const issue = state.issues.find((item) => item.id === state.activeId);
    if (!issue) {
      cacheRef.current = null;
      return null;
    }
    let left = 8;
    let top = 8;
    try {
      const start = editor.view.coordsAtPos(issue.from);
      const end = editor.view.coordsAtPos(issue.to);
      left = Math.min(
        window.innerWidth - 280,
        Math.max(8, Math.min(start.left, end.left))
      );
      top = Math.max(start.bottom, end.bottom) + 6;
    } catch {
      // keep defaults
    }
    const prev = cacheRef.current;
    const zIndex =
      prev && prev.issue.id === issue.id ? prev.zIndex : claimFloatZ();
    const next: CardModel = { issue, left, top, zIndex };
    if (sameCard(prev, next)) return prev;
    cacheRef.current = next;
    return next;
  }, [editor]);

  const card = useSyncExternalStore(subscribe, getSnapshot, () => null);

  if (!card || !editor) return null;

  const showDictionary =
    isHarperSpellingKind(card.issue.kind) && Boolean(card.issue.problem.trim());

  return createPortal(
    <div
      className="harper-lint-card"
      role="dialog"
      aria-label="Writing suggestion"
      style={{
        left: card.left,
        top: card.top,
        zIndex: card.zIndex,
      }}
    >
      <p className="harper-lint-card-kind">{harperKindLabel(card.issue.kind)}</p>
      <p className="harper-lint-card-message">{card.issue.message}</p>
      {card.issue.suggestions.length > 0 && (
        <ul className="harper-lint-card-suggestions">
          {card.issue.suggestions.map((suggestion, index) => (
            <li key={`${suggestion.kind}:${suggestion.text}:${index}`}>
              <button
                type="button"
                onClick={() => {
                  editor
                    .chain()
                    .focus()
                    .applyHarperSuggestion(card.issue.id, index)
                    .run();
                }}
              >
                {suggestionLabel(card.issue.problem, suggestion)}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="harper-lint-card-actions">
        {showDictionary && (
          <button
            type="button"
            onClick={() => {
              updatePrefs({
                harperDictionary: addHarperDictionaryWord(
                  prefs.harperDictionary,
                  card.issue.problem
                ),
              });
              editor.chain().ignoreHarperIssue(card.issue.id).run();
            }}
          >
            Add to dictionary
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            editor.chain().ignoreHarperIssue(card.issue.id).run();
          }}
        >
          Ignore
        </button>
        <button
          type="button"
          onClick={() => {
            editor.commands.setHarperActiveIssue(null);
          }}
        >
          Close
        </button>
      </div>
    </div>,
    document.body
  );
}
