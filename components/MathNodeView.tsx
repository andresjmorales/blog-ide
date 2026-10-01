"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  NodeViewWrapper,
  type NodeViewProps,
  type ReactNodeViewRendererOptions,
} from "@tiptap/react";
import { Selection, TextSelection } from "@tiptap/pm/state";
import {
  MATH_IN_SELECTION,
  renderLatexHtml,
  takeMathAutoOpen,
} from "@/lib/editor/math";
import { claimFloatZ } from "@/lib/pins/pinStore";

const MATH_POPUP_MAX_WIDTH_PX = 448; // min(28rem, …) at 16px root
const MATH_POPUP_EDGE_PAD_PX = 8;
const MATH_POPUP_MIN_VISIBLE_HEIGHT_PX = 120;

type PopupPos = { left: number; top: number };

function hasSelectionTint(
  decorations: readonly { spec?: Record<string, unknown> }[]
): boolean {
  return decorations.some(
    (decoration) => decoration.spec?.[MATH_IN_SELECTION] === true
  );
}

/**
 * ReactNodeViewRenderer options for math: TipTap skips re-rendering when
 * only decorations change, which would leave the selection tint stale.
 */
export const MATH_NODE_VIEW_OPTIONS: Partial<ReactNodeViewRendererOptions> = {
  update: ({ oldNode, newNode, oldDecorations, newDecorations, updateProps }) => {
    if (
      oldNode !== newNode ||
      hasSelectionTint(oldDecorations) !== hasSelectionTint(newDecorations)
    ) {
      updateProps();
    }
    return true;
  },
};

export function InlineMathNodeView(props: NodeViewProps) {
  return <MathNodeView {...props} displayMode={false} />;
}

export function BlockMathNodeView(props: NodeViewProps) {
  return <MathNodeView {...props} displayMode />;
}

const IS_MAC =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
const MOD_LABEL = IS_MAC ? "⌘" : "Ctrl";

function MathNodeView({
  node,
  editor,
  getPos,
  updateAttributes,
  deleteNode,
  selected,
  decorations,
  displayMode,
}: NodeViewProps & { displayMode: boolean }) {
  const latex = String(node.attrs.latex || "");
  // Inside a text selection (copy / cut): tint like selected text.
  const inSelection = hasSelectionTint(decorations);
  // A node just inserted from the toolbar / shortcut opens straight away with
  // its placeholder selected, ready to type over.
  const [autoOpen] = useState(() => takeMathAutoOpen(node));
  const [open, setOpen] = useState(autoOpen);
  const [selectAll, setSelectAll] = useState(autoOpen);
  // Just inserted and never applied: cancelling removes it again.
  const freshRef = useRef(autoOpen);
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
  const sourceRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const source = sourceRef.current;
    if (!source) return;
    source.focus();
    if (selectAll) source.select();
    else source.setSelectionRange(source.value.length, source.value.length);
    // Only on open: later renders must not steal the caret.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Esc also closes when focus has left the source box (unless pinned).
  const closeRef = useRef<() => void>(() => {});
  useEffect(() => {
    if (!open || pinned) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        closeRef.current();
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
    // Read-only views (invitee footnote cards) show the math, no editor.
    if (!editor.isEditable) return;
    setZIndex(claimFloatZ());
    setDraft(latex);
    setPinned(false);
    setPosition(null);
    setSelectAll(false);
    setOpen(true);
  }

  function apply() {
    freshRef.current = false;
    updateAttributes({ latex: draft });
  }

  function hide() {
    setPinned(false);
    setPosition(null);
    setOpen(false);
  }

  function remove() {
    hide();
    deleteNode();
    editor.commands.focus();
  }

  /** Close the popup and put the caret just after the math, ready to type. */
  function close() {
    if (freshRef.current) {
      remove();
      return;
    }
    hide();
    const pos = typeof getPos === "function" ? getPos() : undefined;
    if (typeof pos !== "number") return;
    editor
      .chain()
      .command(({ tr }) => {
        const after = Math.min(pos + node.nodeSize, tr.doc.content.size);
        let selection = Selection.findFrom(tr.doc.resolve(after), 1, true);
        if (!selection) {
          // Display math ending the document: give the caret a line.
          const paragraph = tr.doc.type.schema.nodes.paragraph;
          if (paragraph) {
            tr.insert(after, paragraph.create());
            selection = TextSelection.create(tr.doc, after + 1);
          }
        }
        if (selection) tr.setSelection(selection);
        return true;
      })
      .focus()
      .run();
  }

  /** Apply and close; an emptied equation is removed instead. */
  function done() {
    if (!draft.trim()) {
      remove();
      return;
    }
    apply();
    close();
  }

  useEffect(() => {
    closeRef.current = close;
  });

  function onSourceKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    const mod = event.ctrlKey || event.metaKey;
    if (event.key === "Enter" && mod && event.shiftKey) {
      event.preventDefault();
      apply();
      return;
    }
    if (event.key === "Enter" && mod) {
      event.preventDefault();
      done();
      return;
    }
    // Inline math is one line: plain Enter finishes it.
    if (event.key === "Enter" && !displayMode && !event.shiftKey) {
      event.preventDefault();
      done();
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close();
    }
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
      }${inSelection ? " is-in-selection" : ""}`}
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
                onClick={close}
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
                    title={`Apply to editor (${MOD_LABEL}+Shift+Enter)`}
                  >
                    Refresh
                  </button>
                  <button
                    type="button"
                    onClick={done}
                    title={`Apply and close (${MOD_LABEL}+Enter)`}
                  >
                    Done
                  </button>
                  <button
                    type="button"
                    onClick={close}
                    title="Close without applying (Esc)"
                    aria-label="Close without applying"
                  >
                    ×
                  </button>
                </span>
              </header>
              <textarea
                ref={sourceRef}
                className="blogide-math-source"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={onSourceKeyDown}
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
              <p className="blogide-math-hint">
                <kbd>{displayMode ? `${MOD_LABEL}+Enter` : "Enter"}</kbd> done ·{" "}
                <kbd>{MOD_LABEL}+Shift+Enter</kbd> refresh · <kbd>Esc</kbd> cancel
              </p>
            </div>
          </div>,
          document.body
        )}
    </NodeViewWrapper>
  );
}
