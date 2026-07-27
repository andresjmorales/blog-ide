"use client";

import { useEffect, useRef, useState } from "react";
import {
  EditorContent,
  NodeViewWrapper,
  useEditor,
  useEditorState,
  type NodeViewProps,
} from "@tiptap/react";
import type { Editor } from "@tiptap/core";
import {
  createCaptionExtensions,
  normalizeCaptionMarkdown,
} from "@/lib/editor/imageCaption";
import { promptForLink } from "@/lib/editor/linkShortcut";
import { ItalicIcon, LinkIcon } from "@/components/icons";

/**
 * Substack-style image with a gray “Add caption” field under the image.
 * Caption is stored on the image node (markdown string: bold / italic / link
 * only) and serialized as an adjacent markdown line (no blank line). Broken /
 * empty src is hidden in the rich-text UI (source mode still shows the
 * markdown so the URL can be fixed).
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

  const captionEditor = useEditor({
    extensions: createCaptionExtensions({ withLinkShortcut: true }),
    content: caption,
    contentType: "markdown",
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: "blogide-figcaption-editor outline-none",
        "aria-label": "Image caption",
      },
      handleDOMEvents: {
        mousedown: (_view, event) => {
          event.stopPropagation();
          return false;
        },
      },
    },
  });

  const captionRef = useRef(caption);
  const attrSyncTimer = useRef(0);
  useEffect(() => {
    captionRef.current = caption;
  }, [caption]);

  useEffect(() => {
    if (!captionEditor) return;
    const next = normalizeCaptionMarkdown(caption);
    const current = normalizeCaptionMarkdown(captionEditor.getMarkdown());
    if (next === current) return;
    captionEditor.commands.setContent(caption, {
      contentType: "markdown",
      emitUpdate: false,
    });
  }, [caption, captionEditor]);

  useEffect(() => {
    if (!captionEditor) return;
    const commit = () => {
      const latest = normalizeCaptionMarkdown(captionEditor.getMarkdown());
      if (latest === normalizeCaptionMarkdown(captionRef.current)) return;
      if (!latest && captionRef.current && !captionEditor.isFocused) return;
      updateAttributes({ caption: latest });
    };
    const sync = () => {
      if (attrSyncTimer.current) window.clearTimeout(attrSyncTimer.current);
      // Flush clears immediately so the placeholder can return without waiting.
      const latest = normalizeCaptionMarkdown(captionEditor.getMarkdown());
      const delay =
        !latest && normalizeCaptionMarkdown(captionRef.current) ? 0 : 200;
      attrSyncTimer.current = window.setTimeout(() => {
        attrSyncTimer.current = 0;
        commit();
      }, delay);
    };
    captionEditor.on("update", sync);
    return () => {
      captionEditor.off("update", sync);
      if (attrSyncTimer.current) window.clearTimeout(attrSyncTimer.current);
    };
  }, [captionEditor, updateAttributes]);

  const focused = useEditorState({
    editor: captionEditor,
    selector: ({ editor }) => editor?.isFocused ?? false,
  });
  const editorEmpty = useEditorState({
    editor: captionEditor,
    selector: ({ editor }) => editor?.isEmpty ?? true,
  });
  const marks = useEditorState({
    editor: captionEditor,
    selector: ({ editor }) => ({
      bold: editor?.isActive("bold") ?? false,
      italic: editor?.isActive("italic") ?? false,
      link: editor?.isActive("link") ?? false,
    }),
  });

  // Prefer the caption attr while the nested editor hydrates — isEmpty can be
  // true for a frame after source↔rich switch even when a caption exists.
  const showPlaceholder =
    !normalizeCaptionMarkdown(caption) && editorEmpty !== false;

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
      <div
        className={`blogide-figcaption${showPlaceholder ? " is-empty" : ""}${
          focused ? " is-focused" : ""
        }`}
        contentEditable={false}
        onMouseDown={(event) => event.stopPropagation()}
      >
        {focused && captionEditor && marks && (
          <CaptionToolbar editor={captionEditor} state={marks} />
        )}
        <EditorContent editor={captionEditor} />
      </div>
    </NodeViewWrapper>
  );
}

function CaptionToolbar({
  editor,
  state,
}: {
  editor: Editor;
  state: { bold: boolean; italic: boolean; link: boolean };
}) {
  return (
    <div className="blogide-figcaption-toolbar" role="toolbar" aria-label="Caption formatting">
      <CaptionToolButton
        title="Bold (Ctrl+B)"
        active={state.bold}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <span className="font-bold">B</span>
      </CaptionToolButton>
      <CaptionToolButton
        title="Italic (Ctrl+I)"
        active={state.italic}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <ItalicIcon />
      </CaptionToolButton>
      <CaptionToolButton
        title="Add or edit link (Ctrl+K)"
        active={state.link}
        onClick={() => {
          void promptForLink(editor);
        }}
      >
        <LinkIcon />
      </CaptionToolButton>
    </div>
  );
}

function CaptionToolButton({
  title,
  active = false,
  onClick,
  children,
}: {
  title: string;
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-pressed={active}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={active ? "is-active" : ""}
    >
      {children}
    </button>
  );
}
