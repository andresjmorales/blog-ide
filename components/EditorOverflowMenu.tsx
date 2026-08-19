"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
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

export type OverflowSubmenu = {
  kind: "submenu";
  id: string;
  label: string;
  items: OverflowAction[];
};

export type OverflowItem = OverflowAction | OverflowSeparator | OverflowSubmenu;

type OverflowMenuProps = {
  items: OverflowItem[];
  menuClassName?: string;
  /** Visible control. Defaults to the chrome ⋯ kebab. */
  trigger?: ReactNode;
  label?: string;
  buttonClassName?: string;
};

/** Compact ⋯ menu for secondary editor actions (portaled so toolbar overflow cannot clip it). */
export function EditorOverflowMenu({
  items,
  menuClassName,
  trigger,
  label = "More actions",
  buttonClassName = "blogide-chrome-btn is-icon",
}: OverflowMenuProps) {
  const [open, setOpen] = useState(false);
  const [openSubmenu, setOpenSubmenu] = useState<string | null>(null);
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
      if (e.key === "Escape") {
        setOpen(false);
        setOpenSubmenu(null);
      }
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
      setOpenSubmenu(null);
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
        className={[buttonClassName, open ? "is-active" : ""]
          .filter(Boolean)
          .join(" ")}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        title={label}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => {
          setOpen((v) => !v);
          setOpenSubmenu(null);
        }}
      >
        {trigger ?? (
          <span
            aria-hidden
            className="text-[0.95rem] font-bold leading-none tracking-widest"
          >
            ⋯
          </span>
        )}
        <span className="sr-only">{label}</span>
      </button>
      {open &&
        coords &&
        createPortal(
          <div
            ref={menuRef}
            id={menuId}
            role="menu"
            className={[
              "fixed min-w-[11rem] rounded-md border border-border bg-background py-1 text-sm shadow-md",
              menuClassName,
            ]
              .filter(Boolean)
              .join(" ")}
            style={{ top: coords.top, right: coords.right, zIndex }}
          >
            {items.map((item) => {
              if (item.kind === "separator") {
                return (
                  <div
                    key={item.id}
                    role="separator"
                    className="my-1 border-t border-border"
                  />
                );
              }
              if (item.kind === "submenu") {
                return (
                  <div
                    key={item.id}
                    className="relative"
                    onMouseEnter={() => setOpenSubmenu(item.id)}
                    onMouseLeave={() => setOpenSubmenu(null)}
                  >
                    <button
                      type="button"
                      role="menuitem"
                      aria-haspopup="menu"
                      aria-expanded={openSubmenu === item.id}
                      className="flex w-full items-center justify-between gap-4 px-3 py-1.5 text-left text-foreground hover:bg-panel"
                      onClick={() =>
                        setOpenSubmenu((cur) =>
                          cur === item.id ? null : item.id
                        )
                      }
                    >
                      <span>{item.label}</span>
                      <span className="text-muted">‹</span>
                    </button>
                    {openSubmenu === item.id && (
                      <div
                        role="menu"
                        className="absolute right-full top-0 z-50 mr-0.5 min-w-[10rem] rounded-md border border-border bg-background py-1 shadow-md"
                      >
                        {item.items.map((sub) => (
                          <button
                            key={sub.id}
                            type="button"
                            role="menuitem"
                            disabled={sub.disabled}
                            className="flex w-full px-3 py-1.5 text-left text-foreground hover:bg-panel disabled:opacity-40"
                            onClick={() => {
                              setOpen(false);
                              setOpenSubmenu(null);
                              sub.onSelect();
                            }}
                          >
                            {sub.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              }
              return (
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
              );
            })}
          </div>,
          document.body
        )}
    </>
  );
}
