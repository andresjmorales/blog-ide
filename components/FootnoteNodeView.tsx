"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "@tiptap/markdown";
import {
  EditorContent,
  NodeViewWrapper,
  useEditor,
  useEditorState,
  type NodeViewProps,
} from "@tiptap/react";

// ProseMirror may recreate an atom NodeView when its selection changes.
// Keep transient card visibility keyed by the node's stable ID so that a
// selection-only remount does not immediately close the editor.
const openFootnoteIds = new Set<string>();

function plainText(markdown: string): string {
  return markdown
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_~`]/g, "")
    .trim();
}

export function FootnoteNodeView({
  node,
  editor: outerEditor,
  getPos,
  updateAttributes,
  selected,
}: NodeViewProps) {
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const footnoteId = String(node.attrs.id ?? "");
  const [open, setOpen] = useState(() => openFootnoteIds.has(footnoteId));
  const [cardPosition, setCardPosition] = useState<{
    left?: number;
    top?: number;
  }>({});
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

  const noteEditor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        blockquote: false,
        bulletList: false,
        orderedList: false,
        listItem: false,
        codeBlock: false,
        horizontalRule: false,
        hardBreak: false,
        strike: false,
        underline: false,
        trailingNode: false,
        link: {
          openOnClick: false,
          defaultProtocol: "https",
        },
      }),
      Markdown,
    ],
    content,
    contentType: "markdown",
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: "footnote-card-editor outline-none",
        "aria-label": `Footnote ${number} content`,
      },
      handleKeyDown(_view, event) {
        // Footnotes are inline-only in v1.
        return event.key === "Enter";
      },
    },
  });

  useEffect(() => {
    if (!noteEditor || noteEditor.getMarkdown() === content) return;
    noteEditor.commands.setContent(content, {
      contentType: "markdown",
      emitUpdate: false,
    });
  }, [content, noteEditor]);

  const commitAndClose = useCallback(() => {
    if (noteEditor) {
      updateAttributes({ content: noteEditor.getMarkdown().trim() });
    }
    openFootnoteIds.delete(footnoteId);
    setOpen(false);
  }, [footnoteId, noteEditor, updateAttributes]);

  const openCard = useCallback(() => {
    openFootnoteIds.add(footnoteId);
    setOpen(true);
  }, [footnoteId]);

  useEffect(() => {
    if (!open) return;
    function positionCard() {
      if (window.innerWidth < 768) {
        setCardPosition({});
        return;
      }
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) return;
      const cardWidth = Math.min(352, window.innerWidth - 24);
      const editorBounds =
        buttonRef.current?.closest("main")?.getBoundingClientRect() ?? {
          left: 0,
          right: window.innerWidth,
        };
      const minimumLeft = Math.max(12, editorBounds.left + 12);
      const maximumLeft = Math.min(
        window.innerWidth - cardWidth - 12,
        editorBounds.right - cardWidth - 12
      );
      setCardPosition({
        left: Math.max(
          minimumLeft,
          Math.min(maximumLeft, rect.left + rect.width / 2 - cardWidth / 2)
        ),
        top: rect.bottom + 8,
      });
    }
    positionCard();
    window.addEventListener("resize", positionCard);
    window.addEventListener("scroll", positionCard, true);
    return () => {
      window.removeEventListener("resize", positionCard);
      window.removeEventListener("scroll", positionCard, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        commitAndClose();
        outerEditor.commands.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [commitAndClose, open, outerEditor]);

  return (
    <NodeViewWrapper
      as="span"
      data-footnote-id={footnoteId}
      className={`footnote-node ${selected ? "is-selected" : ""}`}
    >
      <button
        ref={buttonRef}
        type="button"
        className="footnote-ref"
        aria-label={`Edit footnote ${number}`}
        aria-expanded={open}
        onMouseEnter={openCard}
        onClick={() => {
          openCard();
          requestAnimationFrame(() => noteEditor?.commands.focus("end"));
        }}
        contentEditable={false}
      >
        {number}
      </button>

      <span className="footnote-sidenote" contentEditable={false}>
        <span className="footnote-sidenote-number">{number}</span>
        {plainText(content) || "Empty footnote"}
      </span>

      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <span
            className="footnote-card"
            contentEditable={false}
            style={{ left: cardPosition.left, top: cardPosition.top }}
          >
          <span className="footnote-card-heading">
            <span>Footnote {number}</span>
            <button
              type="button"
              onClick={commitAndClose}
              aria-label="Close footnote editor"
            >
              Done
            </button>
          </span>
          <EditorContent editor={noteEditor} />
          <span className="footnote-card-hint">
            Bold, italic, links, and inline code are supported. Escape closes.
          </span>
          </span>,
          document.body
        )}
    </NodeViewWrapper>
  );
}
