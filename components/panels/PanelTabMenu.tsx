"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import {
  DOCK_SIDES,
  PANEL_LABELS,
  type DockSide,
  type PanelId,
} from "@/lib/panels/layout";

type Props = {
  panelId: PanelId;
  currentSide: DockSide;
  selected?: boolean;
  onMoveTo: (side: DockSide) => void;
  onPopOut: () => void;
  onClose: () => void;
  children: React.ReactNode;
};

const SIDE_LABELS: Record<DockSide, string> = {
  left: "Left",
  right: "Right",
  bottom: "Bottom",
};

const VIEW_PAD = 8;

function clampMenuPosition(
  x: number,
  y: number,
  width: number,
  height: number
) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  return {
    x: Math.min(Math.max(VIEW_PAD, x), Math.max(VIEW_PAD, vw - width - VIEW_PAD)),
    y: Math.min(
      Math.max(VIEW_PAD, y),
      Math.max(VIEW_PAD, vh - height - VIEW_PAD)
    ),
  };
}

/** Tab chrome: right-click or kebab opens Move / Pop out / Close. */
export function PanelTabMenu({
  panelId,
  currentSide,
  selected = false,
  onMoveTo,
  onPopOut,
  onClose,
  children,
}: Props) {
  const [open, setOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [submenuLeft, setSubmenuLeft] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const kebabRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        setMoveOpen(false);
      }
    }
    function onPointer(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setMoveOpen(false);
      }
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer, true);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer, true);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    const next = clampMenuPosition(pos.x, pos.y, rect.width, rect.height);
    if (next.x !== pos.x || next.y !== pos.y) {
      setPos(next);
    }
  }, [open, pos.x, pos.y]);

  useLayoutEffect(() => {
    if (!moveOpen || !menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    const subWidth = 124;
    setSubmenuLeft(rect.right + subWidth > window.innerWidth - VIEW_PAD);
  }, [moveOpen, pos.x, pos.y]);

  function openAt(x: number, y: number) {
    setPos({ x, y });
    setMoveOpen(false);
    setSubmenuLeft(false);
    setOpen(true);
  }

  return (
    <div
      ref={rootRef}
      className={`relative inline-flex min-w-0 items-stretch ${
        selected
          ? "border-b-2 border-accent text-foreground"
          : "text-muted hover:text-foreground"
      }`}
      onContextMenu={(e) => {
        e.preventDefault();
        openAt(e.clientX, e.clientY);
      }}
    >
      {children}
      <button
        ref={kebabRef}
        type="button"
        className="flex items-center px-1 opacity-70 hover:bg-panel hover:opacity-100"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        title={`${PANEL_LABELS[panelId]} options`}
        onClick={(e) => {
          e.stopPropagation();
          if (open) {
            setOpen(false);
            setMoveOpen(false);
            return;
          }
          const rect = kebabRef.current?.getBoundingClientRect();
          openAt(rect ? rect.left : e.clientX, rect ? rect.bottom + 2 : e.clientY);
        }}
      >
        <KebabIcon />
        <span className="sr-only">{PANEL_LABELS[panelId]} options</span>
      </button>
      {open && (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={`${PANEL_LABELS[panelId]} panel menu`}
          className="fixed z-[80] min-w-[10.5rem] rounded-md border border-border bg-background py-1 text-sm shadow-md"
          style={{ left: pos.x, top: pos.y }}
        >
          <div className="relative">
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center justify-between px-3 py-1.5 text-left hover:bg-panel"
              onMouseEnter={() => setMoveOpen(true)}
              onClick={() => setMoveOpen((v) => !v)}
            >
              Move to
              <span className="text-muted" aria-hidden>
                {submenuLeft ? "‹" : "›"}
              </span>
            </button>
            {moveOpen && (
              <div
                role="menu"
                className={`absolute top-0 z-[81] min-w-[7.5rem] rounded-md border border-border bg-background py-1 shadow-md ${
                  submenuLeft ? "right-full mr-0.5" : "left-full ml-0.5"
                }`}
              >
                {DOCK_SIDES.filter((side) => side !== currentSide).map(
                  (side) => (
                    <button
                      key={side}
                      type="button"
                      role="menuitem"
                      className="flex w-full px-3 py-1.5 text-left hover:bg-panel"
                      onClick={() => {
                        setOpen(false);
                        setMoveOpen(false);
                        onMoveTo(side);
                      }}
                    >
                      {SIDE_LABELS[side]}
                    </button>
                  )
                )}
              </div>
            )}
          </div>
          <button
            type="button"
            role="menuitem"
            className="flex w-full px-3 py-1.5 text-left hover:bg-panel"
            onClick={() => {
              setOpen(false);
              onPopOut();
            }}
          >
            Pop out
          </button>
          <button
            type="button"
            role="menuitem"
            className="flex w-full px-3 py-1.5 text-left hover:bg-panel"
            onClick={() => {
              setOpen(false);
              onClose();
            }}
          >
            Close
          </button>
        </div>
      )}
    </div>
  );
}

function KebabIcon() {
  return (
    <svg
      width="12"
      height="14"
      viewBox="0 0 12 14"
      fill="currentColor"
      aria-hidden
    >
      <circle cx="6" cy="3" r="1.25" />
      <circle cx="6" cy="7" r="1.25" />
      <circle cx="6" cy="11" r="1.25" />
    </svg>
  );
}
