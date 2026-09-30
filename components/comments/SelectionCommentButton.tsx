"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { CommentAnchor } from "@/lib/comments/anchors";
import { startCommentDraft } from "@/lib/comments/store";
import {
  anchorForSelection,
  currentCommentSelection,
} from "@/lib/comments/surfaces";

type Props = {
  /** Called after a draft starts (e.g. open the phone sheet). */
  onStart?: () => void;
};

/**
 * Floating "Comment" button under a text selection in the shared essay or
 * an open footnote card. Placed below the selection so it doesn't fight the
 * phone's own selection menu, which sits above.
 */
export function SelectionCommentButton({ onStart }: Props) {
  const [place, setPlace] = useState<{ left: number; top: number } | null>(null);
  const pending = useRef<CommentAnchor | null>(null);

  useEffect(() => {
    let frame = 0;
    function update() {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const target = currentCommentSelection();
        const anchor = target ? anchorForSelection(target) : null;
        pending.current = anchor;
        if (!target || !anchor) {
          setPlace(null);
          return;
        }
        const width = 104;
        const left = Math.min(
          Math.max(8, target.rect.left + target.rect.width / 2 - width / 2),
          window.innerWidth - width - 8
        );
        const below = target.rect.bottom + 10;
        const top =
          below + 40 > window.innerHeight
            ? Math.max(8, target.rect.top - 46)
            : below;
        setPlace({ left, top });
      });
    }
    document.addEventListener("selectionchange", update);
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("selectionchange", update);
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, []);

  if (!place || typeof document === "undefined") return null;

  function start() {
    const anchor = pending.current;
    if (!anchor) return;
    startCommentDraft(anchor);
    window.getSelection()?.removeAllRanges();
    setPlace(null);
    onStart?.();
  }

  return createPortal(
    <button
      type="button"
      className="comment-selection-btn"
      style={{ left: place.left, top: place.top }}
      // Keep the selection alive until the click lands.
      onMouseDown={(event) => event.preventDefault()}
      // Start on pointerdown: an open footnote card closes on outside
      // pointerdown, which would drop the selection before a click.
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        start();
      }}
      onClick={(event) => {
        // Keyboard activation only; pointers were handled above.
        if (event.detail === 0) start();
      }}
    >
      <CommentGlyph /> Comment
    </button>,
    document.body
  );
}

export function CommentGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M2.5 3.5h11v7h-6l-3 2.5v-2.5h-2z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}
