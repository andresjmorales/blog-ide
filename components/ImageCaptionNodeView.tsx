"use client";

import { useState } from "react";
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";

/**
 * Substack-style image with a gray “Add caption” field under the image.
 * Caption is stored on the image node and serialized as an adjacent markdown
 * line (no blank line). Broken / empty src is hidden in the rich-text UI
 * (source mode still shows the markdown so the URL can be fixed).
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
  /** Src that last failed to load; cleared implicitly when `src` changes. */
  const [brokenSrc, setBrokenSrc] = useState<string | null>(null);
  const broken = Boolean(src) && brokenSrc === src;

  if (!src.trim() || broken) {
    return (
      <NodeViewWrapper
        as="span"
        className="blogide-figure-broken"
        data-drag-handle
        contentEditable={false}
      />
    );
  }

  return (
    <NodeViewWrapper
      as="figure"
      className={`blogide-figure${selected ? " is-selected" : ""}`}
      data-drag-handle
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        title={title}
        draggable={false}
        onError={() => setBrokenSrc(src)}
      />
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
