"use client";

import { useEffect, useId, useRef, useState } from "react";

export type OverflowAction = {
  id: string;
  label: string;
  onSelect: () => void;
  disabled?: boolean;
};

type Props = {
  items: OverflowAction[];
};

/** Compact ⋯ menu for secondary editor actions. */
export function EditorOverflowMenu({ items }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function onPointer(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer, true);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer, true);
    };
  }, [open]);

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        className="rounded border border-border px-2 py-1 text-xs text-muted hover:bg-panel hover:text-foreground"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        title="More actions"
        onClick={() => setOpen((v) => !v)}
      >
        <span aria-hidden className="inline-block px-0.5 font-bold tracking-widest">
          ⋯
        </span>
        <span className="sr-only">More actions</span>
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          className="absolute right-0 top-full z-50 mt-1 min-w-[11rem] rounded-md border border-border bg-background py-1 text-sm shadow-md"
        >
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              className="flex w-full px-3 py-1.5 text-left text-foreground hover:bg-panel disabled:opacity-40"
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
