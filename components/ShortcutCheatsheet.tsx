"use client";

import { useEffect } from "react";

type Props = {
  open: boolean;
  onClose: () => void;
};

const ROWS: { keys: string; action: string }[] = [
  { keys: "Ctrl+B / I", action: "Bold / italic" },
  { keys: "Ctrl+. / ,", action: "Superscript / subscript" },
  { keys: "Ctrl+K", action: "Link" },
  { keys: "Ctrl+Shift+F", action: "Footnote" },
  { keys: "Ctrl+F", action: "Find (soft highlights)" },
  { keys: "Ctrl+H", action: "Find & replace" },
  { keys: "Ctrl+\\", action: "Toggle markdown split / rich text" },
  { keys: "Enter", action: "Next find match (in find box)" },
  { keys: "?", action: "This cheatsheet (when not typing)" },
  { keys: "Esc", action: "Close bubbles / dialogs" },
];

export function ShortcutCheatsheet({ open, onClose }: Props) {
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

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        aria-label="Close"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard shortcuts"
        className="relative z-[1] w-full max-w-sm rounded-lg border border-border bg-background p-4 shadow-xl"
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Shortcuts</h2>
          <button
            type="button"
            className="rounded px-2 py-1 text-sm text-muted hover:bg-panel"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <ul className="space-y-2 text-sm">
          {ROWS.map((row) => (
            <li
              key={row.keys}
              className="flex items-baseline justify-between gap-3"
            >
              <kbd className="shrink-0 rounded border border-border bg-panel px-1.5 py-0.5 font-mono text-[0.7rem]">
                {row.keys}
              </kbd>
              <span className="text-muted">{row.action}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
