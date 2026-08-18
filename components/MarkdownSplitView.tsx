"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import {
  EditorContent,
  ReactNodeViewRenderer,
  useEditor,
} from "@tiptap/react";
import type { AnyExtension } from "@tiptap/core";
import { createExtensions } from "@/lib/editor/extensions";
import { isLossy, parseBody, previewRoundTrip } from "@/lib/markdown/pipeline";
import { compactDiff, unifiedLineDiff } from "@/lib/markdown/diff";
import { splitFrontmatter } from "@/lib/markdown/frontmatter";
import {
  fileNameToTitle,
  parseTitle,
} from "@/lib/markdown/titleFrontmatter";
import { parseSubtitle } from "@/lib/markdown/subtitle";
import { useEditorPrefs } from "@/components/EditorPrefsContext";
import { FootnotePreviewNodeView } from "@/components/FootnotePreviewNodeView";
import { ImageCaptionNodeView } from "@/components/ImageCaptionNodeView";
import {
  BlockMathNodeView,
  InlineMathNodeView,
} from "@/components/MathNodeView";

/** Preview-safe node views: numbered footnote blobs, images, KaTeX — no cards. */
function withPreviewNodeViews(extension: AnyExtension): AnyExtension {
  if (extension.name === "footnoteRef") {
    return extension.extend({
      addNodeView() {
        return ReactNodeViewRenderer(FootnotePreviewNodeView);
      },
    });
  }
  if (extension.name === "image") {
    return extension.extend({
      addNodeView() {
        return ReactNodeViewRenderer(ImageCaptionNodeView);
      },
    });
  }
  if (extension.name === "inlineMath") {
    return extension.extend({
      addNodeView() {
        return ReactNodeViewRenderer(InlineMathNodeView);
      },
    });
  }
  if (extension.name === "blockMath") {
    return extension.extend({
      addNodeView() {
        return ReactNodeViewRenderer(BlockMathNodeView);
      },
    });
  }
  return extension;
}

const PREVIEW_DEBOUNCE_MS = 180;
const MIN_PANE = 220;
const MAX_PANE = 900;

type Props = {
  sourceText: string;
  onSourceChange: (next: string) => void;
  toolbarExtra?: React.ReactNode;
  shellDock?: React.ReactNode;
  spellcheckEnabled?: boolean;
  spellcheckLang?: string;
  /** Fallback title when frontmatter has none. */
  documentName?: string | null;
  sourceTextareaRef?: RefObject<HTMLTextAreaElement | null>;
};

function unpackPreviewMeta(
  markdown: string,
  fallbackFileName?: string | null
) {
  const { frontmatter, body } = splitFrontmatter(markdown);
  return {
    title:
      parseTitle(frontmatter) ||
      (fallbackFileName ? fileNameToTitle(fallbackFileName) : "Untitled"),
    subtitle: parseSubtitle(frontmatter) || "",
    body,
  };
}

/**
 * Markdown-canonical split: editable source | debounced read-only TipTap preview.
 * Preview never writes back into the buffer. On narrow screens the source pane
 * keeps its saved width, so the preview is a sliver; Rich text returns to
 * the full editor.
 */
export function MarkdownSplitView({
  sourceText,
  onSourceChange,
  toolbarExtra,
  shellDock,
  spellcheckEnabled = false,
  spellcheckLang = "en",
  documentName = null,
  sourceTextareaRef,
}: Props) {
  const { prefs, updatePrefs } = useEditorPrefs();
  /** While dragging the gutter; otherwise width comes from prefs. */
  const [dragWidth, setDragWidth] = useState<number | null>(null);
  const [previewMd, setPreviewMd] = useState(sourceText);
  const [normOpen, setNormOpen] = useState(false);
  const dragRef = useRef<{ startX: number; startW: number } | null>(null);
  const debounceRef = useRef(0);
  const paneWidth = dragWidth ?? prefs.markdownSplitWidth;

  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      debounceRef.current = 0;
      setPreviewMd(sourceText);
    }, PREVIEW_DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [sourceText]);

  const meta = unpackPreviewMeta(previewMd, documentName);
  const lossy = isLossy(previewMd);
  const lossyDiffLines = lossy
    ? compactDiff(unifiedLineDiff(previewMd, previewRoundTrip(previewMd)), 2)
    : [];

  const editor = useEditor({
    extensions: createExtensions({
      markdownTypingShortcuts: prefs.markdownTypingShortcuts,
      smartQuotes: prefs.smartQuotes,
    }).map(withPreviewNodeViews),
    content: parseBody(meta.body),
    editable: false,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: "editor-prose outline-none min-h-[40vh]",
        "aria-label": "Markdown preview",
      },
    },
  });

  useEffect(() => {
    if (!editor) return;
    const { body } = unpackPreviewMeta(previewMd, documentName);
    editor.commands.setContent(parseBody(body), { emitUpdate: false });
  }, [editor, previewMd, documentName]);

  function beginResize(event: React.PointerEvent<HTMLDivElement>) {
    event.preventDefault();
    dragRef.current = { startX: event.clientX, startW: paneWidth };
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);

    function onMove(e: PointerEvent) {
      const drag = dragRef.current;
      if (!drag) return;
      const next = Math.min(
        MAX_PANE,
        Math.max(MIN_PANE, drag.startW + (e.clientX - drag.startX))
      );
      setDragWidth(next);
    }
    function onUp(e: PointerEvent) {
      const drag = dragRef.current;
      dragRef.current = null;
      target.releasePointerCapture(e.pointerId);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      const next = Math.min(
        MAX_PANE,
        Math.max(
          MIN_PANE,
          drag
            ? drag.startW + (e.clientX - drag.startX)
            : (dragWidth ?? prefs.markdownSplitWidth)
        )
      );
      updatePrefs({ markdownSplitWidth: next });
      setDragWidth(null);
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center justify-between border-b border-border px-3 py-1.5">
        <span className="text-xs font-mono uppercase tracking-wider text-muted">
          Markdown · preview
        </span>
        <span className="flex items-center gap-1">{toolbarExtra}</span>
      </div>

      {lossy && (
        <div
          role="status"
          className="border-b border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm"
        >
          <div className="flex flex-wrap items-center gap-3">
            <span>Preview shows normalized form.</span>
            <button
              type="button"
              onClick={() => setNormOpen((open) => !open)}
              className="rounded border border-border px-2.5 py-1 text-xs hover:bg-panel ml-auto"
            >
              {normOpen ? "Hide normalization" : "Show normalization"}
            </button>
          </div>
          {normOpen && (
            <pre className="lossy-diff mt-2 max-h-56 overflow-auto rounded border border-border bg-background p-2 font-mono text-[0.7rem] leading-snug">
              {lossyDiffLines.length === 0 ? (
                <span className="text-muted">
                  No line-level changes detected.
                </span>
              ) : (
                lossyDiffLines.map((line, index) => (
                  <div
                    key={`${line.type}-${index}`}
                    className={
                      line.type === "add"
                        ? "lossy-diff-add"
                        : line.type === "remove"
                          ? "lossy-diff-remove"
                          : "text-muted"
                    }
                  >
                    {line.type === "add"
                      ? `+ ${line.text}`
                      : line.type === "remove"
                        ? `- ${line.text}`
                        : `  ${line.text}`}
                  </div>
                ))
              )}
            </pre>
          )}
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <div
          className="flex min-h-0 shrink-0 flex-col border-r border-border"
          style={{ width: paneWidth }}
        >
          <textarea
            ref={sourceTextareaRef}
            value={sourceText}
            onChange={(e) => onSourceChange(e.target.value)}
            spellCheck={spellcheckEnabled}
            lang={spellcheckLang}
            aria-label="Markdown source"
            className="min-h-0 w-full flex-1 resize-none bg-transparent px-4 py-4 font-mono text-sm leading-relaxed outline-none"
          />
        </div>
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize markdown pane"
          onPointerDown={beginResize}
          className="hidden w-1 shrink-0 cursor-col-resize hover:bg-accent/40 md:block"
        />
        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-2xl px-6 py-10">
            <div className="essay-title-block pointer-events-none select-text">
              <div className="essay-title-input" aria-hidden>
                {meta.title}
              </div>
              {meta.subtitle ? (
                <div className="essay-subtitle-input" aria-hidden>
                  {meta.subtitle}
                </div>
              ) : null}
            </div>
            <EditorContent editor={editor} />
          </div>
        </div>
      </div>
      {shellDock}
    </div>
  );
}
