"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  PANEL_IDS,
  PANEL_LABELS,
  isPanelDocked,
  isPanelFloating,
  type PanelId,
  type PanelLayout,
} from "@/lib/panels/layout";

type Props = {
  layout: PanelLayout;
  onToggle: (id: PanelId) => void;
};

/** Header menu to show/hide dockable panels. */
export function PanelsMenu({ layout, onToggle }: Props) {
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
        className="rounded border border-border px-2 py-1 text-[0.7rem] text-muted hover:border-accent hover:text-foreground"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        title="Show or hide panels"
        onClick={() => setOpen((v) => !v)}
      >
        Panels
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          className="absolute left-0 top-full z-50 mt-1 min-w-[11rem] rounded-md border border-border bg-background py-1 text-sm shadow-md"
        >
          {PANEL_IDS.map((id) => {
            const on =
              isPanelDocked(layout, id) || isPanelFloating(layout, id);
            return (
              <button
                key={id}
                type="button"
                role="menuitemcheckbox"
                aria-checked={on}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-panel"
                onClick={() => {
                  onToggle(id);
                  setOpen(false);
                }}
              >
                <span
                  className={`inline-flex w-3 justify-center text-xs ${
                    on ? "text-accent" : "text-transparent"
                  }`}
                  aria-hidden
                >
                  ✓
                </span>
                {PANEL_LABELS[id]}
                {isPanelFloating(layout, id) && (
                  <span className="ml-auto text-[0.65rem] text-muted">
                    floating
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
