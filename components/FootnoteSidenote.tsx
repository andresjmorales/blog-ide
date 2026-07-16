"use client";

import { useMemo } from "react";
import { generateHTML } from "@tiptap/core";
import { createExtensions } from "@/lib/editor/extensions";
import { parseBody } from "@/lib/markdown/pipeline";

/**
 * Renders footnote markdown with the same TipTap schema as the editor
 * (bold/italic/links/lists/etc.), for the margin sidenote view.
 */
export function FootnoteSidenote({
  number,
  markdown,
  onNumberClick,
  onBodyClick,
}: {
  number: number;
  markdown: string;
  onNumberClick?: () => void;
  onBodyClick?: () => void;
}) {
  const html = useMemo(() => {
    const trimmed = markdown.trim();
    if (!trimmed) return "";
    try {
      return generateHTML(parseBody(trimmed), createExtensions());
    } catch {
      return "";
    }
  }, [markdown]);

  return (
    <span className="footnote-sidenote" contentEditable={false}>
      <button
        type="button"
        className="footnote-sidenote-number"
        title="Scroll to footnote"
        aria-label={`Scroll to footnote ${number}`}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onNumberClick?.();
        }}
      >
        {number}
      </button>
      <span
        role="button"
        tabIndex={0}
        className={`footnote-sidenote-body ${html ? "" : "is-empty"}`}
        title="Edit footnote"
        aria-label={`Edit footnote ${number}`}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onBodyClick?.();
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            event.stopPropagation();
            onBodyClick?.();
          }
        }}
      >
        {html ? (
          <span dangerouslySetInnerHTML={{ __html: html }} />
        ) : (
          "Empty footnote"
        )}
      </span>
    </span>
  );
}
