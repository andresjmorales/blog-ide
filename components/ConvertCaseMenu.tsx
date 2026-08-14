"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Editor } from "@tiptap/core";
import { applyConvertCase, type CaseMode } from "@/lib/editor/applyConvertCase";
import { claimFloatZ } from "@/lib/pins/pinStore";

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

export function ConvertCaseMenu({ editor }: { editor: Editor }) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(
    null
  );
  const [zIndex, setZIndex] = useState(50);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    setCoords({ top: rect.bottom + 4, left: rect.left });
    setZIndex(claimFloatZ());
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      const target = event.target as globalThis.Node;
      if (
        buttonRef.current?.contains(target) ||
        menuRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
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
    <>
      <button
        ref={buttonRef}
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
      {open &&
        coords &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            aria-label="Convert case"
            className="fixed min-w-[10.5rem] rounded-lg border border-border bg-background py-1 shadow-lg"
            style={{ top: coords.top, left: coords.left, zIndex }}
          >
            {OPTIONS.map((option) => (
              <button
                key={option.mode}
                type="button"
                role="menuitem"
                title={option.title}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  applyConvertCase(editor, option.mode);
                  setOpen(false);
                }}
                className="block w-full px-3 py-1.5 text-left text-sm text-muted hover:bg-panel hover:text-foreground"
              >
                {option.label}
              </button>
            ))}
          </div>,
          document.body
        )}
    </>
  );
}
