"use client";

import { useMemo, type Ref } from "react";
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
  rootRef,
  onActivate,
}: {
  number: number;
  markdown: string;
  rootRef?: Ref<HTMLSpanElement>;
  /** Number or body — both scroll to the mark and open the editor. */
  onActivate?: () => void;
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
    <span
      ref={rootRef}
      className="footnote-sidenote"
      contentEditable={false}
      onWheel={(event) => {
        const el = event.currentTarget;
        if (el.scrollHeight > el.clientHeight + 1) {
          event.stopPropagation();
        }
      }}
    >
      <button
        type="button"
        className="footnote-sidenote-number"
        title="Scroll to footnote"
        aria-label={`Scroll to footnote ${number}`}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onActivate?.();
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
          onActivate?.();
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            event.stopPropagation();
            onActivate?.();
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
