"use client";

import { useMemo } from "react";
import { generateHTML } from "@tiptap/core";
import { createExtensions } from "@/lib/editor/extensions";
import { parseBody } from "@/lib/markdown/pipeline";
import { splitFrontmatter } from "@/lib/markdown/frontmatter";
import { parseTitle } from "@/lib/markdown/titleFrontmatter";
import { parseSubtitle } from "@/lib/markdown/subtitle";

const PREVIEW_EXTENSIONS = createExtensions();

/**
 * Publication-style read-only preview of the current essay markdown.
 * Uses the same TipTap schema as the editor (not a separate remark pipeline yet).
 */
export function DocumentPreview({ markdown }: { markdown: string }) {
  const { title, subtitle, html } = useMemo(() => {
    const { frontmatter, body } = splitFrontmatter(markdown || "");
    const title = parseTitle(frontmatter) || "Untitled";
    const subtitle = parseSubtitle(frontmatter);
    let html = "";
    try {
      const trimmed = body.trim();
      html = trimmed
        ? generateHTML(parseBody(trimmed), PREVIEW_EXTENSIONS)
        : "<p class=\"text-muted\">Nothing to preview yet.</p>";
    } catch {
      html = "<p class=\"text-muted\">Could not render preview.</p>";
    }
    return { title, subtitle, html };
  }, [markdown]);

  return (
    <div className="document-preview overflow-y-auto px-4 py-5">
      <article className="document-preview-article editor-prose mx-auto max-w-prose">
        <h1 className="document-preview-title">{title}</h1>
        {subtitle && (
          <p className="document-preview-subtitle">{subtitle}</p>
        )}
        <div dangerouslySetInnerHTML={{ __html: html }} />
      </article>
    </div>
  );
}
