"use client";

import { useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/core";
import { convertCase, type CaseMode } from "@/lib/editor/convertCase";

const OPTIONS: { mode: CaseMode; label: string; title: string }[] = [
  { mode: "sentence", label: "Sentence case", title: "Capitalize first letter" },
  { mode: "upper", label: "UPPER CASE", title: "All uppercase" },
  { mode: "lower", label: "lower case", title: "All lowercase" },
  {
    mode: "title",
    label: "Title Case",
    title: "Capitalize words; keep small prepositions lowercase",
  },
  {
    mode: "capitalized",
    label: "Capitalized",
    title: "Capitalize every word",
  },
];

function applyCase(editor: Editor, mode: CaseMode) {
  const { from, to, empty } = editor.state.selection;
  if (empty) return;
  const text = editor.state.doc.textBetween(from, to, "\n");
  const next = convertCase(text, mode);
  if (next === text) return;
  editor
    .chain()
    .focus()
    .insertContentAt({ from, to }, next)
    .setTextSelection({ from, to: from + next.length })
    .run();
}

export function ConvertCaseMenu({ editor }: { editor: Editor }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (
        rootRef.current &&
        !rootRef.current.contains(event.target as globalThis.Node)
      ) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        title="Convert case"
        aria-expanded={open}
        aria-haspopup="menu"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => setOpen((value) => !value)}
        className={`inline-flex h-8 min-w-8 items-center justify-center rounded px-2 text-[0.75rem] font-semibold leading-none tracking-tight ${
          open
            ? "bg-accent/15 text-accent"
            : "text-muted hover:bg-panel hover:text-foreground"
        }`}
      >
        Cc
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Convert case"
          className="absolute left-0 top-full z-50 mt-1 min-w-[10.5rem] rounded-lg border border-border bg-background py-1 shadow-lg"
        >
          {OPTIONS.map((option) => (
            <button
              key={option.mode}
              type="button"
              role="menuitem"
              title={option.title}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                applyCase(editor, option.mode);
                setOpen(false);
              }}
              className="block w-full px-3 py-1.5 text-left text-sm text-muted hover:bg-panel hover:text-foreground"
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
