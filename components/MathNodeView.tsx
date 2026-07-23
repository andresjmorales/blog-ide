"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  NodeViewWrapper,
  type NodeViewProps,
} from "@tiptap/react";
import { renderLatexHtml } from "@/lib/editor/math";
import { claimFloatZ } from "@/lib/pins/pinStore";

const MATH_POPUP_MAX_WIDTH_PX = 448; // min(28rem, …) at 16px root
const MATH_POPUP_EDGE_PAD_PX = 8;
const MATH_POPUP_MIN_VISIBLE_HEIGHT_PX = 120;

type PopupPos = { left: number; top: number };

export function InlineMathNodeView(props: NodeViewProps) {
  return <MathNodeView {...props} displayMode={false} />;
}

export function BlockMathNodeView(props: NodeViewProps) {
  return <MathNodeView {...props} displayMode />;
}

function MathNodeView({
  node,
  updateAttributes,
  selected,
  displayMode,
}: NodeViewProps & { displayMode: boolean }) {
  const latex = String(node.attrs.latex || "");
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [draft, setDraft] = useState(latex);
  const [zIndex, setZIndex] = useState(80);
  const [position, setPosition] = useState<PopupPos | null>(null);
  const dragRef = useRef<{
    pointerId: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);
  const popupRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open || pinned) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        setOpen(false);
      }
    }
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open, pinned]);

  const rendered = useMemo(
    () => renderLatexHtml(latex, displayMode),
    [latex, displayMode]
  );
  const preview = useMemo(
    () => renderLatexHtml(draft, displayMode),
    [draft, displayMode]
  );

  function openEditor() {
    setZIndex(claimFloatZ());
    setDraft(latex);
    setPinned(false);
    setPosition(null);
    setOpen(true);
  }

  function apply() {
    updateAttributes({ latex: draft });
  }

  const beginDrag = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      if (window.innerWidth < 768) return;
      if (event.button !== 0) return;
      const target = event.target as HTMLElement;
      if (target.closest("button, a, input, textarea, select")) return;
      const popup = popupRef.current;
      const rect = popup?.getBoundingClientRect();
      if (!rect) return;
      event.preventDefault();
      event.stopPropagation();
      setPinned(true);
      setZIndex(claimFloatZ());
      // Switch from centered CSS layout to absolute left/top for dragging.
      setPosition({ left: rect.left, top: rect.top });
      event.currentTarget.setPointerCapture(event.pointerId);
      dragRef.current = {
        pointerId: event.pointerId,
        offsetX: event.clientX - rect.left,
        offsetY: event.clientY - rect.top,
      };
    },
    []
  );

  const onDragMove = useCallback((event: React.PointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const width = Math.min(
      MATH_POPUP_MAX_WIDTH_PX,
      window.innerWidth - MATH_POPUP_EDGE_PAD_PX * 2
    );
    setPosition({
      left: Math.max(
        MATH_POPUP_EDGE_PAD_PX,
        Math.min(
          window.innerWidth - width - MATH_POPUP_EDGE_PAD_PX,
          event.clientX - drag.offsetX
        )
      ),
      top: Math.max(
        MATH_POPUP_EDGE_PAD_PX,
        Math.min(
          window.innerHeight - MATH_POPUP_MIN_VISIBLE_HEIGHT_PX,
          event.clientY - drag.offsetY
        )
      ),
    });
  }, []);

  const endDrag = useCallback((event: React.PointerEvent<HTMLElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null;
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

  const popupStyle: React.CSSProperties = position
    ? {
        left: position.left,
        top: position.top,
        transform: "none",
      }
    : {};

  return (
    <NodeViewWrapper
      as={displayMode ? "div" : "span"}
      className={`blogide-math ${displayMode ? "is-block" : "is-inline"}${
        selected ? " is-selected" : ""
      }`}
      contentEditable={false}
    >
      <button
        type="button"
        className="blogide-math-render"
        title="Edit LaTeX"
        onClick={openEditor}
      >
        {rendered.html ? (
          <span dangerouslySetInnerHTML={{ __html: rendered.html }} />
        ) : (
          <span className="blogide-math-fallback">
            {displayMode ? `$$${latex}$$` : `$${latex}$`}
          </span>
        )}
      </button>

      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="blogide-math-layer" style={{ zIndex }}>
            {!pinned && (
              <button
                type="button"
                className="blogide-math-backdrop"
                aria-label="Close"
                onClick={() => setOpen(false)}
              />
            )}
            <div
              ref={popupRef}
              className="blogide-math-popup"
              role="dialog"
              aria-label="Edit LaTeX"
              style={popupStyle}
            >
              <header
                className="blogide-math-popup-bar"
                title="Drag to move"
                onPointerDown={beginDrag}
                onPointerMove={onDragMove}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
              >
                <span>{displayMode ? "Display math" : "Inline math"}</span>
                <span className="blogide-math-popup-actions">
                  <button
                    type="button"
                    className={pinned ? "is-active" : ""}
                    onClick={() => setPinned((v) => !v)}
                  >
                    {pinned ? "Pinned" : "Pin"}
                  </button>
                  <button
                    type="button"
                    onClick={apply}
                    title="Apply to editor"
                  >
                    Refresh
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPinned(false);
                      setPosition(null);
                      setOpen(false);
                    }}
                  >
                    ×
                  </button>
                </span>
              </header>
              <textarea
                className="blogide-math-source"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                spellCheck={false}
                rows={displayMode ? 5 : 3}
              />
              <div className="blogide-math-preview">
                {preview.html ? (
                  <span dangerouslySetInnerHTML={{ __html: preview.html }} />
                ) : (
                  <span className="blogide-math-fallback">
                    {preview.error || "Preview"}
                  </span>
                )}
              </div>
            </div>
          </div>,
          document.body
        )}
    </NodeViewWrapper>
  );
}
