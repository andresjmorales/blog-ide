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
  ImageIcon,
  ItalicIcon,
  LinkIcon,
  PinIcon,
} from "@/components/icons";
import { SpecialCharsMenu } from "@/components/SpecialCharsMenu";
import { FootnoteSidenote } from "@/components/FootnoteSidenote";
import { useEditorPrefs } from "@/components/EditorPrefsContext";
import { useAppDialog } from "@/components/AppDialog";
import { claimFloatZ } from "@/lib/pins/pinStore";
import { primaryLang } from "@/lib/markdown/spellcheckFrontmatter";

// ProseMirror may recreate an atom NodeView when its selection changes.
// Keep click-/pin-sticky card visibility keyed by the node's stable ID so a
// selection-only remount does not immediately close the editor. Hover-only
// previews are intentionally not persisted across remounts.
const stickyFootnoteIds = new Set<string>();
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
  const sidenoteRef = useRef<HTMLSpanElement | null>(null);
  const footnoteId = String(node.attrs.id ?? "");
  const [open, setOpen] = useState(
    () =>
      stickyFootnoteIds.has(footnoteId) || pinnedFootnoteIds.has(footnoteId)
  );
  /** Click (or pin/drag) keeps the card open; hover alone does not. */
  const [sticky, setSticky] = useState(() =>
    stickyFootnoteIds.has(footnoteId)
  );
  const [pinned, setPinned] = useState(() =>
    pinnedFootnoteIds.has(footnoteId)
  );
  const [expanded, setExpanded] = useState(() =>
    expandedFootnoteIds.has(footnoteId)
  );
  const stickyRef = useRef(sticky);
  const pinnedRef = useRef(pinned);
  const hoverCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragRef = useRef<{
    pointerId: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);

  useEffect(() => {
    stickyRef.current = sticky;
  }, [sticky]);
  useEffect(() => {
    pinnedRef.current = pinned;
  }, [pinned]);
  const [cardPosition, setCardPosition] = useState<{
    left?: number;
    top?: number;
  }>(() => cardPositions.get(footnoteId) ?? {});
  const [cardZ, setCardZ] = useState(40);
  const content = String(node.attrs.content ?? "");
  // Only user drags are sticky; auto-placement should follow the ref on scroll.
  const hasDraggedPosition = cardPositions.has(footnoteId);
  const { prefs } = useEditorPrefs();
  const spellcheckOn = prefs.spellcheckEnabled;
  const spellLang = primaryLang(prefs.spellcheckLanguages);

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
        spellcheck: spellcheckOn ? "true" : "false",
        lang: spellLang,
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

  // Push edits into the node attrs so the margin sidenote stays live — debounced
  // so each keystroke does not rewrite the parent document.
  const contentRef = useRef(content);
  const attrSyncTimer = useRef(0);
  useEffect(() => {
    contentRef.current = content;
  }, [content]);
  useEffect(() => {
    if (!noteEditor) return;
    const sync = () => {
      const next = noteEditor.getMarkdown().trim();
      if (next === contentRef.current) return;
      if (attrSyncTimer.current) window.clearTimeout(attrSyncTimer.current);
      attrSyncTimer.current = window.setTimeout(() => {
        attrSyncTimer.current = 0;
        if (next !== contentRef.current) {
          updateAttributes({ content: next });
        }
      }, 200);
    };
    noteEditor.on("update", sync);
    return () => {
      noteEditor.off("update", sync);
      if (attrSyncTimer.current) window.clearTimeout(attrSyncTimer.current);
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
    if (hoverCloseTimer.current) {
      clearTimeout(hoverCloseTimer.current);
      hoverCloseTimer.current = null;
    }
    commitContent();
    stickyFootnoteIds.delete(footnoteId);
    pinnedFootnoteIds.delete(footnoteId);
    expandedFootnoteIds.delete(footnoteId);
    cardPositions.delete(footnoteId);
    setSticky(false);
    setPinned(false);
    setExpanded(false);
    setCardPosition({});
    setOpen(false);
  }, [commitContent, footnoteId]);

  const cancelHoverClose = useCallback(() => {
    if (hoverCloseTimer.current) {
      clearTimeout(hoverCloseTimer.current);
      hoverCloseTimer.current = null;
    }
  }, []);

  const scheduleHoverClose = useCallback(() => {
    cancelHoverClose();
    hoverCloseTimer.current = setTimeout(() => {
      hoverCloseTimer.current = null;
      // Clicked or pinned cards stay; hover previews dismiss on leave.
      if (!stickyRef.current && !pinnedRef.current) {
        commitAndClose();
      }
    }, 140);
  }, [cancelHoverClose, commitAndClose]);

  const openCard = useCallback(
    (options?: {
      scrollToAnchor?: boolean;
      focusEditor?: boolean;
      /** Prefer positioning near this element when the superscript is off-screen. */
      anchorEl?: HTMLElement | null;
      /** true = click/sidenote; false/omit for hover preview */
      sticky?: boolean;
    }) => {
      cancelHoverClose();
      if (options?.sticky) {
        stickyFootnoteIds.add(footnoteId);
        setSticky(true);
      }
      setCardZ(claimFloatZ());
      setOpen(true);
      // Scroll after open so the card stays mounted; place near sidenote first
      // when the superscript is off-screen (avoids a "ghost" first click).
      if (options?.anchorEl) {
        const rect = options.anchorEl.getBoundingClientRect();
        const cardWidth = Math.min(352, window.innerWidth - 24);
        setCardPosition({
          left: Math.max(
            12,
            Math.min(window.innerWidth - cardWidth - 12, rect.left - cardWidth - 12)
          ),
          top: Math.max(12, Math.min(window.innerHeight - 240, rect.top)),
        });
      }
      if (options?.scrollToAnchor) {
        requestAnimationFrame(() => {
          buttonRef.current?.scrollIntoView({
            behavior: "smooth",
            block: "center",
          });
        });
      }
      if (options?.focusEditor !== false) {
        requestAnimationFrame(() => noteEditor?.commands.focus("end"));
      }
    },
    [cancelHoverClose, footnoteId, noteEditor]
  );

  /** Freeze the floating card at its current viewport spot (pin or drag). */
  const freezeCardPosition = useCallback(() => {
    setCardPosition((current) => {
      if (
        typeof current.left === "number" &&
        typeof current.top === "number"
      ) {
        cardPositions.set(footnoteId, {
          left: current.left,
          top: current.top,
        });
        return current;
      }
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) return current;
      const next = {
        left: Math.max(8, Math.min(window.innerWidth - 360, rect.left)),
        top: Math.max(8, Math.min(window.innerHeight - 120, rect.bottom + 8)),
      };
      cardPositions.set(footnoteId, next);
      return next;
    });
  }, [footnoteId]);

  const togglePinned = useCallback(() => {
    setPinned((currentlyPinned) => {
      const next = !currentlyPinned;
      if (next) {
        pinnedFootnoteIds.add(footnoteId);
        // Snapshot now so scroll handlers stop tracking the superscript.
        freezeCardPosition();
      } else {
        pinnedFootnoteIds.delete(footnoteId);
        // Resume follow-the-ref placement after unpin.
        cardPositions.delete(footnoteId);
        setCardPosition({});
      }
      return next;
    });
  }, [footnoteId, freezeCardPosition]);

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
    freezeCardPosition();
  }, [footnoteId, freezeCardPosition]);

  useEffect(() => {
    if (!open) return;
    function positionCard() {
      if (window.innerWidth < 768) {
        setCardPosition({});
        return;
      }
      // Dragged or pinned cards stay put — do not track the ref on scroll.
      if (hasDraggedPosition || pinnedRef.current) return;
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
      const minimumTop = 12;
      const maximumTop = Math.max(
        minimumTop,
        window.innerHeight - cardHeight - 12
      );
      const offscreen = rect.bottom < 0 || rect.top > window.innerHeight;
      const sidenoteRect = sidenoteRef.current?.getBoundingClientRect();
      // Prefer the visible sticky sidenote while the superscript is off-screen.
      if (offscreen && sidenoteRect && sidenoteRect.bottom > 0) {
        setCardPosition({
          left: Math.max(
            minimumLeft,
            Math.min(maximumLeft, sidenoteRect.left - cardWidth - 12)
          ),
          top: Math.min(
            maximumTop,
            Math.max(minimumTop, sidenoteRect.top)
          ),
        });
        return;
      }
      const preferredTop = rect.bottom + 8;
      const top = offscreen
        ? Math.min(maximumTop, Math.max(minimumTop, window.innerHeight * 0.2))
        : Math.min(maximumTop, Math.max(minimumTop, preferredTop));
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
  }, [open, expanded, hasDraggedPosition, pinned]);

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
    // Pinned cards ignore outside clicks. Hover-only and click-sticky both
    // dismiss on outside pointer (hover also dismisses on mouse leave).
    // Defer attaching so the same gesture that opened the card cannot close it
    // (important when opening from a sticky sidenote while the ref is off-screen).
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
    const timer = window.setTimeout(() => {
      document.addEventListener("pointerdown", closeOnOutsidePointer);
    }, 0);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
    };
  }, [commitAndClose, footnoteId, open, pinned]);

  useEffect(() => {
    return () => {
      if (hoverCloseTimer.current) clearTimeout(hoverCloseTimer.current);
    };
  }, []);

  const beginDrag = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      if (window.innerWidth < 768) return;
      if (event.button !== 0) return;
      // Pin / Done stay clickable — only the bar itself drags.
      const target = event.target as HTMLElement;
      if (target.closest("button, a, input, textarea, select")) return;
      const card = event.currentTarget.closest(
        ".footnote-card"
      ) as HTMLElement | null;
      const rect = card?.getBoundingClientRect();
      if (!rect) return;
      event.preventDefault();
      event.stopPropagation();
      // Dragging implies the user wants the card to stay put.
      pinCard();
      setCardZ(claimFloatZ());
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
          if (prefs.footnoteOpenOnHover) {
            openCard({ focusEditor: false, sticky: false });
          }
        }}
        onMouseLeave={() => {
          if (prefs.footnoteOpenOnHover) scheduleHoverClose();
        }}
        onClick={() => openCard({ sticky: true })}
        contentEditable={false}
      >
        {number}
      </button>

      <FootnoteSidenote
        number={number}
        markdown={content}
        rootRef={sidenoteRef}
        onActivate={() =>
          openCard({
            scrollToAnchor: true,
            sticky: true,
            anchorEl: sidenoteRef.current,
          })
        }
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
            style={{
              left: cardPosition.left,
              top: cardPosition.top,
              zIndex: cardZ,
            }}
            onMouseEnter={cancelHoverClose}
            onMouseLeave={() => {
              if (prefs.footnoteOpenOnHover) scheduleHoverClose();
            }}
            onPointerDown={() => {
              // Interacting with the card counts as engaging it.
              stickyFootnoteIds.add(footnoteId);
              setSticky(true);
              setCardZ(claimFloatZ());
            }}
          >
            <span
              className="footnote-card-heading"
              title="Drag to move"
              onPointerDown={beginDrag}
              onPointerMove={onDragMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
            >
              <span className="footnote-card-title">
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
  const dialog = useAppDialog();
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

  async function insertImage() {
    const src = await dialog.prompt({
      title: "Insert image",
      message: "Path or URL (upload pipeline arrives in milestone 5).",
      defaultValue: "assets/",
      confirmLabel: "Next",
    });
    if (!src) return;
    const alt =
      (await dialog.prompt({
        title: "Alt text",
        message: "Optional description for accessibility.",
        defaultValue: "",
        confirmLabel: "Insert",
      })) ?? "";
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
        onClick={() => {
          void promptForLink(editor);
        }}
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
            <ImageIcon />
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
