"use client";

import { useEffect, useId, useState } from "react";
import type { Editor } from "@tiptap/core";
import {
  formatBibtexSource,
  type CitationStyle,
} from "@/lib/citations/formatBibtex";
import { useEditorPrefs } from "@/components/EditorPrefsContext";

type Props = {
  editor: Editor;
  open: boolean;
  onClose: () => void;
};

export function CitationInsertDialog({ editor, open, onClose }: Props) {
  const titleId = useId();
  const { prefs } = useEditorPrefs();
  const prefStyle: CitationStyle =
    prefs.dashStyle === "mla" ? "mla" : "chicago";
  const [source, setSource] = useState("");
  const [styleOverride, setStyleOverride] = useState<CitationStyle | null>(
    null
  );
  const [asFootnote, setAsFootnote] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const style = styleOverride ?? prefStyle;

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    }
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open, onClose]);

  if (!open) return null;

  function close() {
    setSource("");
    setStyleOverride(null);
    setError(null);
    onClose();
  }

  function insert() {
    const formatted = formatBibtexSource(source, style);
    if (formatted.length === 0) {
      setError("No BibTeX entries found. Paste an @article{…} or @book{…}.");
      return;
    }
    setError(null);
    if (asFootnote) {
      for (const cite of formatted) {
        editor.chain().focus().insertFootnote(cite).run();
      }
    } else {
      editor.chain().focus().insertContent(formatted.join("\n\n")).run();
    }
    close();
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        aria-label="Close"
        onClick={close}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-[1] flex w-full max-w-lg flex-col rounded-lg border border-border bg-background shadow-xl"
      >
        <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <h2 id={titleId} className="text-sm font-semibold">
            Insert citation
          </h2>
          <button
            type="button"
            className="rounded px-2 py-1 text-sm text-muted hover:bg-panel hover:text-foreground"
            onClick={close}
          >
            ×
          </button>
        </header>
        <div className="space-y-3 px-4 py-3 text-sm">
          <p className="text-xs text-muted">
            Paste a BibTeX entry. Formats to plain text (Chicago or MLA) and
            inserts at the caret.
          </p>
          <textarea
            className="min-h-[10rem] w-full rounded border border-border bg-panel px-2 py-1.5 font-mono text-xs outline-none focus:border-accent"
            value={source}
            onChange={(event) => setSource(event.target.value)}
            placeholder={`@article{key,\n  author = {Doe, Jane},\n  title = {Example},\n  journal = {Journal},\n  year = {2024}\n}`}
            spellCheck={false}
          />
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <label>
              Style{" "}
              <select
                value={style}
                onChange={(event) =>
                  setStyleOverride(event.target.value as CitationStyle)
                }
                className="rounded border border-border bg-background px-1.5 py-1"
              >
                <option value="chicago">Chicago</option>
                <option value="mla">MLA</option>
              </select>
            </label>
            <label className="inline-flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={asFootnote}
                onChange={(event) => setAsFootnote(event.target.checked)}
              />
              Insert as footnote
            </label>
          </div>
          {error && (
            <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
          )}
        </div>
        <footer className="flex justify-end gap-2 border-t border-border px-4 py-3">
          <button
            type="button"
            className="rounded border border-border px-3 py-1.5 text-xs font-medium hover:border-accent hover:text-accent"
            onClick={close}
          >
            Cancel
          </button>
          <button
            type="button"
            className="rounded border border-accent bg-accent/10 px-3 py-1.5 text-xs font-medium text-accent hover:bg-accent/20"
            onClick={insert}
          >
            Insert
          </button>
        </footer>
      </div>
    </div>
  );
}
