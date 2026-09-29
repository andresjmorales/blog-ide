"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Editor } from "@tiptap/core";
import { claimFloatZ } from "@/lib/pins/pinStore";

export const TEX_INSERT_OPTIONS: {
  id: "inline" | "display";
  label: string;
  hint: string;
  title: string;
  run: (editor: Editor) => void;
}[] = [
  {
    id: "inline",
    label: "Inline math",
    hint: "$…$",
    title: "Math inside a sentence (Ctrl+Shift+E)",
    run: (editor) => editor.chain().focus().insertInlineMath("x").run(),
  },
  {
    id: "display",
    label: "Display math",
    hint: "$$…$$",
    title: "Centered equation on its own line (Ctrl+Shift+D)",
    run: (editor) => editor.chain().focus().insertBlockMath("x^2").run(),
  },
];

/** TeX toolbar button: pick inline `$…$` or display `$$…$$` math. */
export function TexInsertMenu({ editor }: { editor: Editor }) {
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
        title="Insert math (inline or display)"
        aria-expanded={open}
        aria-haspopup="menu"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => setOpen((value) => !value)}
        className={`inline-flex h-8 min-w-8 items-center justify-center rounded px-2 text-[0.8125rem] leading-none ${
          open
            ? "bg-accent/15 text-accent"
            : "text-muted hover:bg-panel hover:text-foreground"
        }`}
      >
        TeX
      </button>
      {open &&
        coords &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            aria-label="Insert math"
            className="tex-insert-menu fixed min-w-[12rem] rounded-lg border border-border bg-background py-1 shadow-lg"
            style={{ top: coords.top, left: coords.left, zIndex }}
          >
            {TEX_INSERT_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                role="menuitem"
                title={option.title}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  option.run(editor);
                  setOpen(false);
                }}
                className="flex w-full items-center justify-between gap-4 px-3 py-1.5 text-left text-sm text-muted hover:bg-panel hover:text-foreground"
              >
                <span>{option.label}</span>
                <span className="font-mono text-xs opacity-70">
                  {option.hint}
                </span>
              </button>
            ))}
          </div>,
          document.body
        )}
    </>
  );
}
