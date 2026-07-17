"use client";

import { useCallback, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  POP_OUT_MIN_HEIGHT,
  POP_OUT_MIN_WIDTH,
} from "@/lib/pins/popOutStore";

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
  headerActions?: ReactNode;
  children: ReactNode;
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
  headerActions,
  children,
}: Props) {
  const dragRef = useRef<{
    pointerId: number;
    offsetX: number;
    offsetY: number;
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
      event.preventDefault();
      onRaise();
      event.currentTarget.setPointerCapture(event.pointerId);
      dragRef.current = {
        pointerId: event.pointerId,
        offsetX: event.clientX - left,
        offsetY: event.clientY - top,
      };
    },
    [left, onRaise, top]
  );

  const onDragMove = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      onMove(event.clientX - drag.offsetX, event.clientY - drag.offsetY);
    },
    [onMove]
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
      event.currentTarget.setPointerCapture(event.pointerId);
      resizeRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        startW: width,
        startH: height,
      };
    },
    [height, onRaise, width]
  );

  const onResizeMove = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      const resize = resizeRef.current;
      if (!resize || resize.pointerId !== event.pointerId) return;
      onResize(
        Math.max(
          POP_OUT_MIN_WIDTH,
          resize.startW + (event.clientX - resize.startX)
        ),
        Math.max(
          POP_OUT_MIN_HEIGHT,
          resize.startH + (event.clientY - resize.startY)
        )
      );
    },
    [onResize]
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
      className="pinned-surface"
      style={{ left, top, width, height, zIndex }}
      onPointerDown={onRaise}
      role="dialog"
      aria-label={title}
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
            aria-label="Close pop-out"
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
