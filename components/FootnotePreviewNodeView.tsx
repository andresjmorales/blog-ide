"use client";

import {
  NodeViewWrapper,
  useEditorState,
  type NodeViewProps,
} from "@tiptap/react";
import { footnoteNumberAt } from "@/lib/editor/footnoteNumbers";

/**
 * Read-only numbered footnote mark for split-view preview.
 * Full FootnoteNodeView (cards, pins, nested editor) stays WYSIWYG-only.
 */
export function FootnotePreviewNodeView({
  node,
  editor: outerEditor,
  getPos,
  selected,
}: NodeViewProps) {
  const footnoteId = String(node.attrs.id ?? "");
  const content = String(node.attrs.content ?? "");

  const number = useEditorState({
    editor: outerEditor,
    selector: ({ editor }) =>
      footnoteNumberAt(
        editor.state.doc,
        typeof getPos() === "number" ? getPos() : null,
        footnoteId
      ),
  });

  return (
    <NodeViewWrapper
      as="span"
      data-footnote-id={footnoteId}
      className={`footnote-node ${selected ? "is-selected" : ""}`}
    >
      <span
        className="footnote-ref"
        title={content || `Footnote ${number}`}
        aria-label={`Footnote ${number}`}
      >
        {number}
      </span>
    </NodeViewWrapper>
  );
}
