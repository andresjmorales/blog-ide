"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { claimFloatZ } from "@/lib/pins/pinStore";

export type OverflowAction = {
  kind?: "action";
  id: string;
  label: string;
  onSelect: () => void;
  disabled?: boolean;
};

export type OverflowSeparator = {
  kind: "separator";
  id: string;
};

export type OverflowItem = OverflowAction | OverflowSeparator;

type Props = {
  items: OverflowItem[];
};

/** Compact ⋯ menu for secondary editor actions (portaled so toolbar overflow cannot clip it). */
export function EditorOverflowMenu({ items }: Props) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; right: number } | null>(
    null
  );
  const [zIndex, setZIndex] = useState(50);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    setCoords({
      top: rect.bottom + 4,
      right: Math.max(8, window.innerWidth - rect.right),
    });
    setZIndex(claimFloatZ());
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function onPointer(e: PointerEvent) {
      const target = e.target as Node;
      if (
        buttonRef.current?.contains(target) ||
        menuRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer, true);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer, true);
    };
  }, [open]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="rounded border border-border px-2 py-1 text-xs text-muted hover:bg-panel hover:text-foreground"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        title="More actions"
        onClick={() => setOpen((v) => !v)}
      >
        <span
          aria-hidden
          className="inline-block px-0.5 font-bold tracking-widest"
        >
          ⋯
        </span>
        <span className="sr-only">More actions</span>
      </button>
      {open &&
        coords &&
        createPortal(
          <div
            ref={menuRef}
            id={menuId}
            role="menu"
            className="fixed min-w-[11rem] rounded-md border border-border bg-background py-1 text-sm shadow-md"
            style={{ top: coords.top, right: coords.right, zIndex }}
          >
            {items.map((item) =>
              item.kind === "separator" ? (
                <div
                  key={item.id}
                  role="separator"
                  className="my-1 border-t border-border"
                />
              ) : (
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
              )
            )}
          </div>,
          document.body
        )}
    </>
  );
}
