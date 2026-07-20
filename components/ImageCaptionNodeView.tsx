"use client";

import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";

/**
 * Substack-style image with a gray “Add caption” field under the image.
 * Caption is stored on the image node and serialized as an adjacent markdown
 * line (no blank line).
 */
export function ImageCaptionNodeView({
  node,
  updateAttributes,
  selected,
}: NodeViewProps) {
  const src = String(node.attrs.src || "");
  const alt = String(node.attrs.alt || "");
  const title =
    typeof node.attrs.title === "string" && node.attrs.title
      ? node.attrs.title
      : undefined;
  const caption = String(node.attrs.caption || "");

  return (
    <NodeViewWrapper
      as="figure"
      className={`blogide-figure${selected ? " is-selected" : ""}`}
      data-drag-handle
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} title={title} draggable={false} />
      <input
        type="text"
        className="blogide-figcaption-input"
        value={caption}
        placeholder="Add caption"
        aria-label="Image caption"
        onChange={(event) =>
          updateAttributes({ caption: event.currentTarget.value })
        }
        onMouseDown={(event) => event.stopPropagation()}
      />
    </NodeViewWrapper>
  );
}
