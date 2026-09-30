"use client";

import { useMemo, type Ref } from "react";
import { generateHTML } from "@tiptap/core";
import { createExtensions } from "@/lib/editor/extensions";
import { parseBody } from "@/lib/markdown/pipeline";

/** Shared schema — creating TipTap extensions per sidenote render is costly. */
const SIDENOTE_EXTENSIONS = createExtensions();

/** Footnote markdown → HTML with the essay schema ("" when empty). */
export function footnoteHtml(markdown: string): string {
  const trimmed = markdown.trim();
  if (!trimmed) return "";
  try {
    return generateHTML(parseBody(trimmed), SIDENOTE_EXTENSIONS);
  } catch {
    return "";
  }
}

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
  const html = useMemo(() => footnoteHtml(markdown), [markdown]);

  return (
    <span
      ref={rootRef}
      className="footnote-sidenote"
      contentEditable={false}
      onPointerDown={(event) => {
        event.stopPropagation();
      }}
      onClick={(event) => {
        // The whole row opens the note, not just the number or its text
        // (a click beside a short note used to hit nothing).
        event.preventDefault();
        event.stopPropagation();
        onActivate?.();
      }}
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
        // Clicks (links included) bubble to the row, which opens the note;
        // otherwise a link-only note would be unreachable from the sidenote.
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
