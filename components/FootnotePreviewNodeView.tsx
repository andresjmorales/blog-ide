"use client";

import {
  NodeViewWrapper,
  useEditorState,
  type NodeViewProps,
} from "@tiptap/react";

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
    selector: ({ editor }) => {
      const ownPosition = getPos();
      if (typeof ownPosition !== "number") return 1;
      let count = 0;
      editor.state.doc.descendants((child, position) => {
        if (position > ownPosition) return false;
        if (child.type.name === "footnoteRef") count += 1;
        return true;
      });
      return Math.max(count, 1);
    },
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
