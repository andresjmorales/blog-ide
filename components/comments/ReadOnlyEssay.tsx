"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  EditorContent,
  ReactNodeViewRenderer,
  useEditor,
} from "@tiptap/react";
import type { AnyExtension, Editor } from "@tiptap/core";
import { createExtensions } from "@/lib/editor/extensions";
import { parseBody } from "@/lib/markdown/pipeline";
import { renderLatexHtml } from "@/lib/editor/math";
import { FootnoteNodeView } from "@/components/FootnoteNodeView";
import { EndnotesSection } from "@/components/EndnotesSection";
import { CommentHighlights } from "@/lib/comments/highlights";
import { setActiveThread } from "@/lib/comments/store";
import { useCommentHighlights } from "@/lib/comments/useCommentHighlights";
import { registerCommentSurface } from "@/lib/comments/surfaces";

/** KaTeX without the LaTeX editor popover. */
function readOnlyMathView(display: boolean) {
  return () =>
    ({ node }: { node: { attrs: Record<string, unknown> } }) => {
      const dom = document.createElement(display ? "div" : "span");
      dom.className = display ? "blogide-block-math" : "blogide-inline-math";
      const latex = String(node.attrs.latex ?? "");
      const { html } = renderLatexHtml(latex, display);
      if (html) dom.innerHTML = html;
      else dom.textContent = latex;
      return { dom };
    };
}

/** Image + plain caption, no caption editor. */
function readOnlyImageView() {
  return ({ node }: { node: { attrs: Record<string, unknown> } }) => {
    const figure = document.createElement("figure");
    figure.className = "blogide-figure";
    const img = document.createElement("img");
    img.src = String(node.attrs.src ?? "");
    img.alt = String(node.attrs.alt ?? "");
    const title = String(node.attrs.title ?? "");
    if (title) img.title = title;
    img.loading = "lazy";
    figure.appendChild(img);
    const caption = String(node.attrs.caption ?? "")
      .replace(/[*_`]/g, "")
      .trim();
    if (caption) {
      const figcaption = document.createElement("figcaption");
      figcaption.className = "blogide-figcaption";
      figcaption.textContent = caption;
      figure.appendChild(figcaption);
    }
    return { dom: figure };
  };
}

function withReadOnlyViews(extension: AnyExtension): AnyExtension {
  switch (extension.name) {
    case "footnoteRef":
      return extension.extend({
        addNodeView() {
          return ReactNodeViewRenderer(FootnoteNodeView, {
            stopEvent: ({ event }) => {
              const target = event.target;
              return (
                target instanceof Element &&
                Boolean(target.closest(".footnote-ref"))
              );
            },
          });
        },
      });
    case "image":
      return extension.extend({ addNodeView: readOnlyImageView });
    case "inlineMath":
      return extension.extend({ addNodeView: readOnlyMathView(false) });
    case "blockMath":
      return extension.extend({ addNodeView: readOnlyMathView(true) });
    default:
      return extension;
  }
}

type Props = {
  /** Markdown body (frontmatter already split off). */
  body: string;
  commentsEnabled: boolean;
  onEditor?: (editor: Editor | null) => void;
};

/**
 * The invitee's copy of a shared essay: the same schema and footnote node
 * views as the owner's editor, with editing off, so anchors made here
 * resolve against the owner's text model.
 */
export function ReadOnlyEssay({ body, commentsEnabled, onEditor }: Props) {
  const initial = useMemo(() => parseBody(body), []); // eslint-disable-line react-hooks/exhaustive-deps
  const editor = useEditor({
    extensions: [
      ...createExtensions().map(withReadOnlyViews),
      CommentHighlights.configure({
        onActivate: (threadId) => setActiveThread(threadId),
      }),
    ],
    content: initial,
    editable: false,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: "editor-prose shared-essay-prose outline-none",
        "aria-label": "Shared essay",
        spellcheck: "false",
      },
      handleClickOn(_view, _pos, _node, _nodePos, event) {
        const target = event.target;
        if (!(target instanceof Element)) return false;
        const link = target.closest("a[href]");
        if (!link) return false;
        const href = link.getAttribute("href") ?? "";
        if (/^https?:\/\//i.test(href)) {
          window.open(href, "_blank", "noopener,noreferrer");
          return true;
        }
        return false;
      },
    },
  });

  // Refresh: swap in the latest text without rebuilding the editor.
  const lastBody = useRef(body);
  useEffect(() => {
    if (!editor || body === lastBody.current) return;
    lastBody.current = body;
    editor.commands.setContent(parseBody(body), { emitUpdate: false });
  }, [editor, body]);

  useEffect(() => {
    onEditor?.(editor);
    return () => onEditor?.(null);
  }, [editor, onEditor]);

  useCommentHighlights(editor, commentsEnabled);
  useEffect(() => {
    if (!editor) return;
    return registerCommentSurface(editor, null);
  }, [editor]);

  // Readers get the notes after the essay, open, like a printed piece.
  const [notesOpen, setNotesOpen] = useState(true);

  return (
    <>
      <EditorContent editor={editor} />
      {editor && (
        <EndnotesSection
          editor={editor}
          expanded={notesOpen}
          onExpandedChange={setNotesOpen}
        />
      )}
    </>
  );
}
