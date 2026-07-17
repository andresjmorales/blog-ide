"use client";

import { useMemo } from "react";
import { buildPublicationPreview } from "@/lib/preview/publicationHtml";

/**
 * Inline publication preview (kept for possible future right-panel use).
 * Primary entry point today: ⋯ → Preview in new tab via openPublicationPreviewTab.
 */
export function DocumentPreview({ markdown }: { markdown: string }) {
  const { title, subtitle, author, bodyHtml } = useMemo(
    () => buildPublicationPreview(markdown),
    [markdown]
  );

  return (
    <div className="document-preview min-h-0 flex-1 overflow-y-auto px-4 py-5">
      <article className="document-preview-article editor-prose mx-auto max-w-prose">
        <h1 className="document-preview-title">{title}</h1>
        {subtitle && (
          <p className="document-preview-subtitle">{subtitle}</p>
        )}
        {author && (
          <p className="document-preview-author">{author}</p>
        )}
        <div dangerouslySetInnerHTML={{ __html: bodyHtml }} />
      </article>
    </div>
  );
}
