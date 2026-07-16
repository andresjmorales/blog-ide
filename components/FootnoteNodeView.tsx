"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { Markdown } from "@tiptap/markdown";
import {
  EditorContent,
  NodeViewWrapper,
  useEditor,
  useEditorState,
  type NodeViewProps,
} from "@tiptap/react";
import type { Editor } from "@tiptap/core";
import {
  LinkShortcut,
  promptForLink,
} from "@/lib/editor/linkShortcut";
import {
  GrabHandle,
  ItalicIcon,
  LinkIcon,
  PinIcon,
} from "@/components/icons";
import { SpecialCharsMenu } from "@/components/SpecialCharsMenu";
import { FootnoteSidenote } from "@/components/FootnoteSidenote";
import { useEditorPrefs } from "@/components/EditorPrefsContext";

// ProseMirror may recreate an atom NodeView when its selection changes.
// Keep transient card visibility keyed by the node's stable ID so that a
// selection-only remount does not immediately close the editor.
const openFootnoteIds = new Set<string>();
const pinnedFootnoteIds = new Set<string>();
const expandedFootnoteIds = new Set<string>();
const cardPositions = new Map<string, { left: number; top: number }>();

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
  const [pinned, setPinned] = useState(() =>
    pinnedFootnoteIds.has(footnoteId)
  );
  const [expanded, setExpanded] = useState(() =>
    expandedFootnoteIds.has(footnoteId)
  );
  const dragRef = useRef<{
    pointerId: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);
  const [cardPosition, setCardPosition] = useState<{
    left?: number;
    top?: number;
  }>(() => cardPositions.get(footnoteId) ?? {});
  const content = String(node.attrs.content ?? "");
  // Only user drags are sticky; auto-placement should follow the ref on scroll.
  const hasDraggedPosition = cardPositions.has(footnoteId);
  const { prefs } = useEditorPrefs();

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
        // Headings stay document-level only (spec / UX: footnotes are asides).
        heading: false,
        underline: false,
        trailingNode: false,
        link: {
          openOnClick: false,
          defaultProtocol: "https",
        },
      }),
      Image,
      LinkShortcut,
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
    },
  });

  useEffect(() => {
    if (!noteEditor || noteEditor.getMarkdown() === content) return;
    noteEditor.commands.setContent(content, {
      contentType: "markdown",
      emitUpdate: false,
    });
  }, [content, noteEditor]);

  // Push edits into the node attrs as you type so the margin sidenote stays live.
  const contentRef = useRef(content);
  contentRef.current = content;
  useEffect(() => {
    if (!noteEditor) return;
    const sync = () => {
      const next = noteEditor.getMarkdown().trim();
      if (next !== contentRef.current) {
        updateAttributes({ content: next });
      }
    };
    noteEditor.on("update", sync);
    return () => {
      noteEditor.off("update", sync);
    };
  }, [noteEditor, updateAttributes]);

  const commitContent = useCallback(() => {
    if (!noteEditor) return;
    const next = noteEditor.getMarkdown().trim();
    if (next !== content) {
      updateAttributes({ content: next });
    }
  }, [content, noteEditor, updateAttributes]);

  const commitAndClose = useCallback(() => {
    commitContent();
    openFootnoteIds.delete(footnoteId);
    pinnedFootnoteIds.delete(footnoteId);
    expandedFootnoteIds.delete(footnoteId);
    cardPositions.delete(footnoteId);
    setPinned(false);
    setExpanded(false);
    setCardPosition({});
    setOpen(false);
  }, [commitContent, footnoteId]);

  const openCard = useCallback(
    (options?: { scrollToAnchor?: boolean; focusEditor?: boolean }) => {
      if (options?.scrollToAnchor) {
        buttonRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      }
      openFootnoteIds.add(footnoteId);
      setOpen(true);
      if (options?.focusEditor !== false) {
        requestAnimationFrame(() => noteEditor?.commands.focus("end"));
      }
    },
    [footnoteId, noteEditor]
  );

  const togglePinned = useCallback(() => {
    setPinned((currentlyPinned) => {
      const next = !currentlyPinned;
      if (next) {
        pinnedFootnoteIds.add(footnoteId);
      } else {
        pinnedFootnoteIds.delete(footnoteId);
      }
      return next;
    });
  }, [footnoteId]);

  const toggleExpanded = useCallback(() => {
    setExpanded((currentlyExpanded) => {
      const next = !currentlyExpanded;
      if (next) {
        expandedFootnoteIds.add(footnoteId);
      } else {
        expandedFootnoteIds.delete(footnoteId);
      }
      return next;
    });
  }, [footnoteId]);

  const pinCard = useCallback(() => {
    pinnedFootnoteIds.add(footnoteId);
    setPinned(true);
  }, [footnoteId]);

  useEffect(() => {
    if (!open) return;
    function positionCard() {
      if (window.innerWidth < 768) {
        setCardPosition({});
        return;
      }
      // Keep a user-dragged position; otherwise follow the superscript.
      if (hasDraggedPosition) return;
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) return;
      const cardWidth = Math.min(
        expanded ? 448 : 352,
        window.innerWidth - 24
      );
      const cardHeight = expanded ? 320 : 240;
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
      const preferredTop = rect.bottom + 8;
      // When the superscript is off-screen (common with sticky sidenotes),
      // keep the floating editor inside the viewport instead of following it off.
      const minimumTop = 12;
      const maximumTop = Math.max(
        minimumTop,
        window.innerHeight - cardHeight - 12
      );
      let top = preferredTop;
      if (rect.bottom < 0 || rect.top > window.innerHeight) {
        top = Math.min(
          maximumTop,
          Math.max(minimumTop, window.innerHeight * 0.2)
        );
      } else {
        top = Math.min(maximumTop, Math.max(minimumTop, preferredTop));
      }
      setCardPosition({
        left: Math.max(
          minimumLeft,
          Math.min(maximumLeft, rect.left + rect.width / 2 - cardWidth / 2)
        ),
        top,
      });
    }
    positionCard();
    window.addEventListener("resize", positionCard);
    window.addEventListener("scroll", positionCard, true);
    return () => {
      window.removeEventListener("resize", positionCard);
      window.removeEventListener("scroll", positionCard, true);
    };
  }, [open, expanded, hasDraggedPosition]);

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

  useEffect(() => {
    if (!open || pinned) return;
    function closeOnOutsidePointer(event: PointerEvent) {
      const targetFootnote =
        event.target instanceof Element
          ? event.target
              .closest("[data-footnote-id]")
              ?.getAttribute("data-footnote-id")
          : null;
      if (targetFootnote !== footnoteId) {
        commitAndClose();
      }
    }
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () =>
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, [commitAndClose, footnoteId, open, pinned]);

  const beginDrag = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      if (window.innerWidth < 768) return;
      const card = event.currentTarget.closest(
        ".footnote-card"
      ) as HTMLElement | null;
      const rect = card?.getBoundingClientRect();
      if (!rect) return;
      event.preventDefault();
      event.stopPropagation();
      // Dragging implies the user wants the card to stay put.
      pinCard();
      event.currentTarget.setPointerCapture(event.pointerId);
      dragRef.current = {
        pointerId: event.pointerId,
        offsetX: event.clientX - rect.left,
        offsetY: event.clientY - rect.top,
      };
    },
    [pinCard]
  );

  const onDragMove = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      const width = Math.min(
        expanded ? 448 : 352,
        window.innerWidth - 24
      );
      const next = {
        left: Math.max(
          8,
          Math.min(
            window.innerWidth - width - 8,
            event.clientX - drag.offsetX
          )
        ),
        top: Math.max(
          8,
          Math.min(window.innerHeight - 120, event.clientY - drag.offsetY)
        ),
      };
      cardPositions.set(footnoteId, next);
      setCardPosition(next);
    },
    [expanded, footnoteId]
  );

  const endDrag = useCallback((event: React.PointerEvent<HTMLElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null;
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

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
        onMouseEnter={() => {
          if (prefs.footnoteOpenOnHover) openCard({ focusEditor: false });
        }}
        onClick={() => openCard()}
        contentEditable={false}
      >
        {number}
      </button>

      <FootnoteSidenote
        number={number}
        markdown={content}
        onNumberClick={() => openCard({ scrollToAnchor: true })}
        onBodyClick={() => openCard({ scrollToAnchor: false })}
      />

      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <span
            className={`footnote-card ${pinned ? "is-pinned" : ""} ${
              expanded ? "is-expanded" : ""
            }`}
            data-footnote-id={footnoteId}
            contentEditable={false}
            style={{ left: cardPosition.left, top: cardPosition.top }}
          >
            <span className="footnote-card-heading">
              <span className="footnote-card-title">
                <button
                  type="button"
                  className="footnote-grab"
                  title="Drag to move"
                  aria-label="Drag footnote"
                  onPointerDown={beginDrag}
                  onPointerMove={onDragMove}
                  onPointerUp={endDrag}
                  onPointerCancel={endDrag}
                >
                  <GrabHandle />
                </button>
                <span>Footnote {number}</span>
              </span>
              <span className="footnote-card-actions">
                <button
                  type="button"
                  onClick={togglePinned}
                  aria-pressed={pinned}
                  title={pinned ? "Unpin footnote" : "Pin footnote"}
                  aria-label={pinned ? "Unpin footnote" : "Pin footnote"}
                >
                  <PinIcon />
                </button>
                <button
                  type="button"
                  onClick={commitAndClose}
                  aria-label="Close footnote editor"
                >
                  Done
                </button>
              </span>
            </span>
            {noteEditor && (
              <FootnoteToolbar
                editor={noteEditor}
                expanded={expanded}
                onToggleExpanded={toggleExpanded}
              />
            )}
            <EditorContent editor={noteEditor} />
            <span className="footnote-card-hint">
              {expanded
                ? "Full formatting except headings. Nested footnotes are not supported."
                : "Bold, italic, and links. Expand for lists, quotes, code, and more."}
            </span>
          </span>,
          document.body
        )}
    </NodeViewWrapper>
  );
}

function FootnoteToolbar({
  editor,
  expanded,
  onToggleExpanded,
}: {
  editor: Editor;
  expanded: boolean;
  onToggleExpanded: () => void;
}) {
  const state = useEditorState({
    editor,
    selector: ({ editor }) => ({
      bold: editor.isActive("bold"),
      italic: editor.isActive("italic"),
      strike: editor.isActive("strike"),
      code: editor.isActive("code"),
      link: editor.isActive("link"),
      blockquote: editor.isActive("blockquote"),
      bulletList: editor.isActive("bulletList"),
      orderedList: editor.isActive("orderedList"),
      codeBlock: editor.isActive("codeBlock"),
    }),
  });

  function insertImage() {
    const src = window.prompt(
      "Image path or URL (upload pipeline arrives in milestone 5)",
      "assets/"
    );
    if (!src) return;
    const alt = window.prompt("Alt text", "") ?? "";
    editor.chain().focus().setImage({ src, alt }).run();
  }

  return (
    <span
      className={`footnote-card-toolbar ${expanded ? "is-expanded" : ""}`}
    >
      <FootnoteToolButton
        title="Bold (Ctrl+B)"
        active={state.bold}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <span className="font-bold">B</span>
      </FootnoteToolButton>
      <FootnoteToolButton
        title="Italic (Ctrl+I)"
        active={state.italic}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <ItalicIcon />
      </FootnoteToolButton>
      <FootnoteToolButton
        title="Add or edit link (Ctrl+K)"
        active={state.link}
        onClick={() => promptForLink(editor)}
      >
        <LinkIcon />
      </FootnoteToolButton>

      {expanded && (
        <>
          <FootnoteToolButton
            title="Strikethrough"
            active={state.strike}
            onClick={() => editor.chain().focus().toggleStrike().run()}
          >
            <span className="line-through">S</span>
          </FootnoteToolButton>
          <FootnoteToolButton
            title="Inline code"
            active={state.code}
            onClick={() => editor.chain().focus().toggleCode().run()}
          >
            <span className="font-mono text-[0.65rem]">{"<>"}</span>
          </FootnoteToolButton>
          <span className="footnote-toolbar-sep" aria-hidden />
          <FootnoteToolButton
            title="Blockquote"
            active={state.blockquote}
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
          >
            {"\u201C\u201D"}
          </FootnoteToolButton>
          <FootnoteToolButton
            title="Bullet list"
            active={state.bulletList}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
          >
            •
          </FootnoteToolButton>
          <FootnoteToolButton
            title="Ordered list"
            active={state.orderedList}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
          >
            1.
          </FootnoteToolButton>
          <FootnoteToolButton
            title="Code block"
            active={state.codeBlock}
            onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          >
            <span className="font-mono text-[0.65rem]">{"{ }"}</span>
          </FootnoteToolButton>
          <FootnoteToolButton
            title="Horizontal rule"
            onClick={() => editor.chain().focus().setHorizontalRule().run()}
          >
            —
          </FootnoteToolButton>
          <FootnoteToolButton title="Insert image" onClick={insertImage}>
            Img
          </FootnoteToolButton>
          <SpecialCharsMenu editor={editor} />
        </>
      )}

      <FootnoteToolButton
        title={
          expanded
            ? "Collapse formatting toolbar"
            : "Expand formatting toolbar"
        }
        active={expanded}
        onClick={onToggleExpanded}
      >
        <ExpandIcon expanded={expanded} />
      </FootnoteToolButton>
    </span>
  );
}

function ExpandIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      aria-hidden
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      className={expanded ? "rotate-180" : ""}
    >
      <path
        d="M4 6.5 8 10.5 12 6.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function FootnoteToolButton({
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
