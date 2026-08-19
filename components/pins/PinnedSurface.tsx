"use client";

import { useCallback, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  POP_OUT_MIN_HEIGHT,
  POP_OUT_MIN_WIDTH,
} from "@/lib/pins/popOutStore";
import { shouldStartPointerDrag } from "@/lib/pins/surfacePointer";

type Props = {
  title: string;
  left: number;
  top: number;
  width: number;
  height: number;
  zIndex: number;
  onClose: () => void;
  onRaise: () => void;
  onMove: (left: number, top: number) => void;
  onResize: (width: number, height: number) => void;
  /** Fires once when a titlebar gesture crosses the drag threshold. */
  onDragStart?: () => void;
  headerActions?: ReactNode;
  children: ReactNode;
  className?: string;
  closeLabel?: string;
  minWidth?: number;
  minHeight?: number;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  /** Extra data-* attributes on the floating root (e.g. data-footnote-id). */
  dataAttributes?: Record<string, string>;
};

export function PinnedSurface({
  title,
  left,
  top,
  width,
  height,
  zIndex,
  onClose,
  onRaise,
  onMove,
  onResize,
  onDragStart,
  headerActions,
  children,
  className,
  closeLabel = "Close pop-out",
  minWidth = POP_OUT_MIN_WIDTH,
  minHeight = POP_OUT_MIN_HEIGHT,
  onMouseEnter,
  onMouseLeave,
  dataAttributes,
}: Props) {
  const dragRef = useRef<{
    pointerId: number;
    originX: number;
    originY: number;
    offsetX: number;
    offsetY: number;
    dragging: boolean;
  } | null>(null);
  const resizeRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    startW: number;
    startH: number;
  } | null>(null);

  const beginDrag = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      if (event.button !== 0) return;
      const target = event.target as HTMLElement;
      if (target.closest("button, a, input, textarea, select")) return;
      onRaise();
      dragRef.current = {
        pointerId: event.pointerId,
        originX: event.clientX,
        originY: event.clientY,
        offsetX: event.clientX - left,
        offsetY: event.clientY - top,
        dragging: false,
      };
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        /* jsdom / already captured */
      }
    },
    [left, onRaise, top]
  );

  const onDragMove = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      if (!drag.dragging) {
        if (
          !shouldStartPointerDrag(
            { x: drag.originX, y: drag.originY },
            { x: event.clientX, y: event.clientY }
          )
        ) {
          return;
        }
        drag.dragging = true;
        event.preventDefault();
        onDragStart?.();
      }
      onMove(event.clientX - drag.offsetX, event.clientY - drag.offsetY);
    },
    [onDragStart, onMove]
  );

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

  const beginResize = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      onRaise();
      resizeRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        startW: width,
        startH: height,
      };
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        /* jsdom / already captured */
      }
    },
    [height, onRaise, width]
  );

  const onResizeMove = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      const resize = resizeRef.current;
      if (!resize || resize.pointerId !== event.pointerId) return;
      onResize(
        Math.max(minWidth, resize.startW + (event.clientX - resize.startX)),
        Math.max(
          minHeight,
          resize.startH + (event.clientY - resize.startY)
        )
      );
    },
    [minHeight, minWidth, onResize]
  );

  const endResize = useCallback((event: React.PointerEvent<HTMLElement>) => {
    if (resizeRef.current?.pointerId === event.pointerId) {
      resizeRef.current = null;
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        /* already released */
      }
    }
  }, []);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className={["pinned-surface", className].filter(Boolean).join(" ")}
      style={{ left, top, width, height, zIndex }}
      onPointerDown={onRaise}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      role="dialog"
      aria-label={title}
      {...dataAttributes}
    >
      <header
        className="pinned-surface-titlebar"
        onPointerDown={beginDrag}
        onPointerMove={onDragMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <span className="pinned-surface-title" title={title}>
          {title}
        </span>
        <span className="pinned-surface-actions">
          {headerActions}
          <button
            type="button"
            className="pinned-surface-close"
            aria-label={closeLabel}
            onClick={onClose}
          >
            ×
          </button>
        </span>
      </header>
      <div className="pinned-surface-body">{children}</div>
      <div
        className="pinned-surface-resize"
        aria-hidden
        onPointerDown={beginResize}
        onPointerMove={onResizeMove}
        onPointerUp={endResize}
        onPointerCancel={endResize}
      />
    </div>,
    document.body
  );
}
