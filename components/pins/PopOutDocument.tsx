"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { generateHTML } from "@tiptap/core";
import { createExtensions } from "@/lib/editor/extensions";
import { parseBody } from "@/lib/markdown/pipeline";
import { splitFrontmatter } from "@/lib/markdown/frontmatter";
import { parseTitle } from "@/lib/markdown/titleFrontmatter";
import { openDocument } from "@/lib/sync/engine";
import { PinnedSurface } from "@/components/pins/PinnedSurface";
import {
  closePopOut,
  raisePopOut,
  updatePopOut,
  type PopOutWindow,
} from "@/lib/pins/popOutStore";

const POP_EXTENSIONS = createExtensions();

function bodyHtml(markdown: string): string {
  const { body } = splitFrontmatter(markdown);
  const trimmed = body.trim();
  if (!trimmed) {
    return `<p class="popout-empty">Empty document.</p>`;
  }
  try {
    return generateHTML(parseBody(trimmed), POP_EXTENSIONS);
  } catch {
    return `<pre class="popout-fallback">${escapeHtml(trimmed)}</pre>`;
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function PopOutDocument({
  win,
  onOpenInEditor,
}: {
  win: PopOutWindow;
  onOpenInEditor: (nodeId: string) => void;
}) {
  const [markdown, setMarkdown] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const opened = await openDocument(win.nodeId);
      setMarkdown(opened.markdown);
      const title =
        parseTitle(splitFrontmatter(opened.markdown).frontmatter) ||
        win.title;
      if (title !== win.title) {
        updatePopOut(win.nodeId, { title });
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not open document."
      );
      setMarkdown(null);
    } finally {
      setLoading(false);
    }
  }, [win.nodeId, win.title]);

  useEffect(() => {
    // Defer so we don't sync-setState inside the effect body (eslint).
    const id = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(id);
  }, [load]);

  const html = useMemo(
    () => (markdown != null ? bodyHtml(markdown) : ""),
    [markdown]
  );

  return (
    <PinnedSurface
      title={win.title}
      left={win.left}
      top={win.top}
      width={win.width}
      height={win.height}
      zIndex={win.zIndex}
      onClose={() => closePopOut(win.nodeId)}
      onRaise={() => raisePopOut(win.nodeId)}
      onMove={(left, top) => updatePopOut(win.nodeId, { left, top })}
      onResize={(width, height) => updatePopOut(win.nodeId, { width, height })}
      headerActions={
        <>
          <button
            type="button"
            className="pinned-surface-btn"
            title="Reload from saved document"
            onClick={() => void load()}
          >
            Refresh
          </button>
          <button
            type="button"
            className="pinned-surface-btn"
            title="Open this document in the main editor"
            onClick={() => onOpenInEditor(win.nodeId)}
          >
            Open
          </button>
        </>
      }
    >
      {loading && (
        <p className="popout-status">Opening…</p>
      )}
      {error && !loading && (
        <p className="popout-status popout-error">{error}</p>
      )}
      {!loading && !error && (
        <div
          className="popout-prose editor-prose"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      )}
    </PinnedSurface>
  );
}
