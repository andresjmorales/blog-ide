"use client";

import { useEffect, useRef, useState } from "react";

export type ContextMenuItem =
  | {
      kind: "action";
      id: string;
      label: string;
      danger?: boolean;
      disabled?: boolean;
      onSelect: () => void;
    }
  | {
      kind: "submenu";
      id: string;
      label: string;
      disabled?: boolean;
      items: Array<{
        id: string;
        label: string;
        onSelect: () => void;
      }>;
    }
  | { kind: "separator"; id: string };

type Props = {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
};

export function ExplorerContextMenu({ x, y, items, onClose }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [openSubmenu, setOpenSubmenu] = useState<string | null>(null);
  const [submenuUp, setSubmenuUp] = useState(false);
  const [pos, setPos] = useState({ left: x, top: y });

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const left = Math.min(x, window.innerWidth - rect.width - 8);
    const top = Math.min(y, window.innerHeight - rect.height - 8);
    setPos({ left: Math.max(8, left), top: Math.max(8, top) });
  }, [x, y, items]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    function onPointer(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) onClose();
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer, true);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer, true);
    };
  }, [onClose]);

  return (
    <div
      ref={rootRef}
      role="menu"
      className="explorer-context-menu fixed z-50 min-w-[11rem] rounded-md border border-border bg-background py-1 text-sm shadow-md"
      style={{ left: pos.left, top: pos.top }}
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
              onMouseEnter={(e) => {
                if (item.disabled) return;
                // Open upward when there isn't ~16rem of room below the
                // trigger, so long folder lists stay on screen.
                const rect = e.currentTarget.getBoundingClientRect();
                setSubmenuUp(window.innerHeight - rect.top < 280);
                setOpenSubmenu(item.id);
              }}
              onMouseLeave={() => setOpenSubmenu(null)}
            >
              <button
                type="button"
                role="menuitem"
                disabled={item.disabled}
                className="flex w-full items-center justify-between gap-4 px-3 py-1.5 text-left hover:bg-panel disabled:opacity-40"
                onClick={(e) => {
                  e.preventDefault();
                  if (!item.disabled) {
                    const rect =
                      e.currentTarget.parentElement?.getBoundingClientRect();
                    if (rect) {
                      setSubmenuUp(window.innerHeight - rect.top < 280);
                    }
                    setOpenSubmenu((cur) =>
                      cur === item.id ? null : item.id
                    );
                  }
                }}
              >
                <span>{item.label}</span>
                <span className="text-muted">›</span>
              </button>
              {openSubmenu === item.id && (
                <div
                  role="menu"
                  className={`absolute left-full z-50 ml-0.5 max-h-64 min-w-[10rem] overflow-y-auto rounded-md border border-border bg-background py-1 shadow-md ${
                    submenuUp ? "bottom-0" : "top-0"
                  }`}
                >
                  {item.items.length === 0 ? (
                    <div className="px-3 py-1.5 text-xs text-muted">
                      No folders
                    </div>
                  ) : (
                    item.items.map((sub) => (
                      <button
                        key={sub.id}
                        type="button"
                        role="menuitem"
                        className="block w-full truncate px-3 py-1.5 text-left hover:bg-panel"
                        onClick={() => {
                          sub.onSelect();
                          onClose();
                        }}
                      >
                        {sub.label}
                      </button>
                    ))
                  )}
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
            className={`block w-full px-3 py-1.5 text-left hover:bg-panel disabled:opacity-40 ${
              item.danger
                ? "text-red-600 dark:text-red-400"
                : "text-foreground"
            }`}
            onClick={() => {
              if (item.disabled) return;
              item.onSelect();
              onClose();
            }}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
