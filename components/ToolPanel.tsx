"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ClipboardIcon, PinIcon } from "@/components/icons";
import { claimFloatZ } from "@/lib/pins/pinStore";

const PANEL_MAX_WIDTH_PX = 460;
const PANEL_EDGE_PAD_PX = 8;
const PANEL_MIN_VISIBLE_HEIGHT_PX = 160;
const PANEL_DEFAULT_TOP_VH = 10;

type PopupPos = { left: number; top: number };

export type ToolPanelTab<T extends string> = { id: T; label: string };

/**
 * Pinnable, draggable floating panel with tabs (Copyedit, Publish).
 * Fixed height like Settings: the title bar and tabs stay put, the body
 * scrolls, and switching tabs never resizes the panel.
 */
export function ToolPanel<T extends string>({
  title,
  icon,
  tabs,
  tab,
  onTab,
  onClose,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  tabs: ToolPanelTab<T>[];
  tab: T;
  onTab: (tab: T) => void;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const titleId = useId();
  const [pinned, setPinned] = useState(false);
  const [zIndex, setZIndex] = useState(() => claimFloatZ());
  const [position, setPosition] = useState<PopupPos | null>(null);
  const popupRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{
    pointerId: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);

  useEffect(() => {
    if (pinned) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    }
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [pinned, onClose]);

  const beginDrag = useCallback((event: React.PointerEvent<HTMLElement>) => {
    if (window.innerWidth < 768) return;
    if (event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (target.closest("button, a, input, textarea, select")) return;
    const rect = popupRef.current?.getBoundingClientRect();
    if (!rect) return;
    event.preventDefault();
    event.stopPropagation();
    setPinned(true);
    setZIndex(claimFloatZ());
    setPosition({ left: rect.left, top: rect.top });
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
    };
  }, []);

  const onDragMove = useCallback((event: React.PointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const width = Math.min(
      PANEL_MAX_WIDTH_PX,
      window.innerWidth - PANEL_EDGE_PAD_PX * 2
    );
    setPosition({
      left: Math.max(
        PANEL_EDGE_PAD_PX,
        Math.min(
          window.innerWidth - width - PANEL_EDGE_PAD_PX,
          event.clientX - drag.offsetX
        )
      ),
      top: Math.max(
        PANEL_EDGE_PAD_PX,
        Math.min(
          window.innerHeight - PANEL_MIN_VISIBLE_HEIGHT_PX,
          event.clientY - drag.offsetY
        )
      ),
    });
  }, []);

  const endDrag = useCallback((event: React.PointerEvent<HTMLElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null;
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        /* already released */
      }
    }
  }, []);

  const popupStyle: React.CSSProperties = position
    ? { left: position.left, top: position.top, transform: "none" }
    : { top: `${PANEL_DEFAULT_TOP_VH}vh` };

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="blogide-cleanup-layer" style={{ zIndex }}>
      {!pinned && (
        <button
          type="button"
          className="blogide-cleanup-backdrop"
          aria-label="Close"
          onClick={onClose}
        />
      )}
      <div
        ref={popupRef}
        className="blogide-cleanup-panel"
        role="dialog"
        aria-modal={!pinned}
        aria-labelledby={titleId}
        style={popupStyle}
        onPointerDown={() => setZIndex(claimFloatZ())}
      >
        <header
          className="blogide-cleanup-bar"
          title="Drag to move"
          onPointerDown={beginDrag}
          onPointerMove={onDragMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <h2 id={titleId} className="blogide-cleanup-title">
            {icon}
            {title}
          </h2>
          <span className="blogide-cleanup-bar-actions">
            <button
              type="button"
              className={pinned ? "is-active" : ""}
              title={pinned ? "Unpin" : "Pin (keep open while you edit)"}
              aria-label={pinned ? `Unpin ${title}` : `Pin ${title}`}
              aria-pressed={pinned}
              onClick={() => {
                if (!pinned) {
                  const rect = popupRef.current?.getBoundingClientRect();
                  if (rect) setPosition({ left: rect.left, top: rect.top });
                  setZIndex(claimFloatZ());
                }
                setPinned((value) => !value);
              }}
            >
              <PinIcon className="blogide-tool-icon" />
            </button>
            <button type="button" aria-label={`Close ${title}`} onClick={onClose}>
              ×
            </button>
          </span>
        </header>

        <div className="blogide-cleanup-tabs" role="tablist" aria-label={title}>
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              className={
                tab === item.id
                  ? "blogide-cleanup-tab is-active"
                  : "blogide-cleanup-tab"
              }
              onClick={() => onTab(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="blogide-cleanup-body" role="tabpanel">
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
}

export function ActionButton({
  label,
  hint,
  disabled,
  onClick,
  primary,
}: {
  label: string;
  hint?: string;
  disabled?: boolean;
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      onMouseDown={(event) => event.preventDefault()}
      className={
        primary ? "blogide-cleanup-action is-primary" : "blogide-cleanup-action"
      }
      title={hint || label}
    >
      <span className="blogide-cleanup-action-label">{label}</span>
      {hint ? <span className="blogide-cleanup-action-hint">{hint}</span> : null}
    </button>
  );
}

/** Small inline button used in rows (Find, Fix, Apply…). */
export function MiniButton({
  children,
  onClick,
  disabled,
  title,
  primary,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      className={primary ? "blogide-mini-btn is-primary" : "blogide-mini-btn"}
      disabled={disabled}
      title={title}
      // Keep the editor selection intact.
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export function CopyIconButton({
  label,
  disabled,
  onClick,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="blogide-publish-copy-btn"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
    >
      <ClipboardIcon className="blogide-tool-icon" />
    </button>
  );
}
