"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { DiffLine } from "@/lib/markdown/diff";

const WRAP_KEY = "blogide.diffWrap";

function readWrap(): boolean {
  try {
    return localStorage.getItem(WRAP_KEY) !== "0";
  } catch {
    return true;
  }
}

/**
 * Scrollable diff box with a "Wrap lines" toggle and an Expand button that
 * reopens the same diff in a near-fullscreen overlay. Wrap is remembered
 * per browser. Unwrapped, rows stretch to the longest line so add/remove
 * highlights run the full scroll width.
 */
export function DiffViewer({
  title = "Changes",
  className = "",
  children,
}: {
  title?: string;
  className?: string;
  children: ReactNode;
}) {
  const [wrap, setWrap] = useState(readWrap);
  const [expanded, setExpanded] = useState(false);

  function toggleWrap() {
    setWrap((current) => {
      const next = !current;
      try {
        localStorage.setItem(WRAP_KEY, next ? "1" : "0");
      } catch {
        // Private mode: keep the choice for this session only.
      }
      return next;
    });
  }

  useEffect(() => {
    if (!expanded) return;
    // Capture on window so Escape shrinks the diff before the parent
    // dialog's document listener closes the whole dialog.
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      setExpanded(false);
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [expanded]);

  const toolbar = (
    <div className="diff-viewer-toolbar">
      <button
        type="button"
        aria-pressed={wrap}
        className={wrap ? "is-on" : undefined}
        onClick={toggleWrap}
      >
        Wrap lines
      </button>
      <button
        type="button"
        aria-pressed={expanded}
        onClick={() => setExpanded((current) => !current)}
      >
        {expanded ? "Exit full screen" : "Expand"}
      </button>
    </div>
  );

  const body = (
    <div
      className={`diff-viewer-body ${wrap ? "is-wrapped" : "is-nowrap"} ${className}`}
    >
      <div className="diff-viewer-content">{children}</div>
    </div>
  );

  if (!expanded) {
    return (
      <div className="diff-viewer">
        {toolbar}
        {body}
      </div>
    );
  }

  return (
    <>
      <div className="diff-viewer">
        {toolbar}
        <p className="settings-help">Showing in full screen.</p>
      </div>
      {createPortal(
        <div className="diff-viewer-overlay" role="presentation">
          <button
            type="button"
            className="settings-backdrop"
            aria-label="Exit full screen"
            onClick={() => setExpanded(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className="diff-viewer-expanded"
          >
            <div className="diff-viewer-expanded-header">
              <h2>{title}</h2>
              {toolbar}
            </div>
            {body}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

/** Line-level diff rows ("+", "-", context) for use inside DiffViewer. */
export function LineDiffRows({ lines }: { lines: DiffLine[] }) {
  return (
    <div className="line-diff">
      {lines.map((line, index) => (
        <div
          key={`${line.type}-${index}`}
          className={
            line.type === "add"
              ? "line-diff-row lossy-diff-add"
              : line.type === "remove"
                ? "line-diff-row lossy-diff-remove"
                : "line-diff-row text-muted"
          }
        >
          <span className="line-diff-sign" aria-hidden="true">
            {line.type === "add" ? "+" : line.type === "remove" ? "-" : " "}
          </span>
          <span className="line-diff-text">{line.text}</span>
        </div>
      ))}
    </div>
  );
}
