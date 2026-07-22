"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  NodeViewWrapper,
  type NodeViewProps,
} from "@tiptap/react";
import { renderLatexHtml } from "@/lib/editor/math";
import { claimFloatZ } from "@/lib/pins/pinStore";

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
    setOpen(true);
  }

  function apply() {
    updateAttributes({ latex: draft });
  }

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
              className="blogide-math-popup"
              role="dialog"
              aria-label="Edit LaTeX"
            >
              <header className="blogide-math-popup-bar">
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
