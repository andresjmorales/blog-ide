"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import {
  EditorContent,
  NodeViewWrapper,
  useEditor,
  useEditorState,
  type NodeViewProps,
} from "@tiptap/react";
import {
  openLinkEditor,
} from "@/lib/editor/linkShortcut";
import { PinIcon } from "@/components/icons";
import {
  clearFindHighlights,
  scrollMatchIntoView,
  setFindHighlights,
} from "@/lib/editor/findHighlight";
import { findInEditor } from "@/lib/editor/findReplaceInEditor";
import { FootnoteSidenote } from "@/components/FootnoteSidenote";
import { FootnoteToolbar } from "@/components/FootnoteToolbar";
import { useEditorPrefs } from "@/components/EditorPrefsContext";
import { useEssaySpellcheck } from "@/components/EssaySpellcheckContext";
import { claimFloatZ } from "@/lib/pins/pinStore";
import { applyEditorDomLang } from "@/lib/editor/domAttrs";
import {
  getFootnoteFindSession,
  setFootnoteFindSession,
  subscribeFootnoteFindSession,
} from "@/lib/editor/footnoteFindBridge";
import { consumeFootnoteEditorOpen } from "@/lib/editor/footnoteOpen";
import {
  applyFootnoteHistoryKey,
  footnoteHistoryAction,
  isFootnoteHistoryTarget,
} from "@/lib/editor/footnoteHistoryKeys";
import { createFootnoteExtensions } from "@/lib/editor/footnoteSchema";
import { firstImageFile } from "@/lib/editor/insertEssayImage";
import { PinnedSurface } from "@/components/pins/PinnedSurface";
import {
  FOOTNOTE_CARD_HEIGHT,
  FOOTNOTE_CARD_MIN_HEIGHT,
  FOOTNOTE_CARD_MIN_WIDTH,
  FOOTNOTE_CARD_WIDTH,
  footnoteAttrSyncDelay,
  isDesktopFootnoteSurface,
  isFootnoteOutsidePointerTarget,
  placeFootnoteCard,
  shouldApplyExternalFootnoteContent,
  shouldCommitFootnoteAttrs,
  shouldFollowFootnoteRef,
  shouldRepositionFootnoteCard,
} from "@/lib/editor/footnoteCard";
import { shouldStartPointerDrag } from "@/lib/pins/surfacePointer";
import {
  caretCoordsAtPos,
  footnoteDropPosFromCoords,
  isNoOpFootnoteMove,
} from "@/lib/editor/moveFootnoteRef";

// ProseMirror may recreate an atom NodeView when its selection changes.
// Keep click-/pin-sticky card visibility keyed by the node's stable ID so a
// selection-only remount does not immediately close the editor. Hover-only
// previews are intentionally not persisted across remounts.
const stickyFootnoteIds = new Set<string>();
const pinnedFootnoteIds = new Set<string>();
const autoOpenedFootnoteIds = new Set<string>();
const cardPositions = new Map<
  string,
  { left: number; top: number; width?: number; height?: number }
>();

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
  const [open, setOpen] = useState(() => {
    if (consumeFootnoteEditorOpen(footnoteId)) {
      stickyFootnoteIds.add(footnoteId);
      autoOpenedFootnoteIds.add(footnoteId);
      return true;
    }
    return (
      stickyFootnoteIds.has(footnoteId) || pinnedFootnoteIds.has(footnoteId)
    );
  });
  /** Click (or pin/drag) keeps the card open; hover alone does not. */
  const [sticky, setSticky] = useState(() =>
    stickyFootnoteIds.has(footnoteId)
  );
  const [pinned, setPinned] = useState(() =>
    pinnedFootnoteIds.has(footnoteId)
  );
  const stickyRef = useRef(sticky);
  const pinnedRef = useRef(pinned);
  const openRef = useRef(open);
  const hoverCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragSuppressUntil = useRef(0);
  const refDrag = useRef<{
    pointerId: number;
    originX: number;
    originY: number;
    dragging: boolean;
  } | null>(null);
  const skipClickAfterDrag = useRef(false);
  const [refDragGhost, setRefDragGhost] = useState<{
    x: number;
    y: number;
    caret: { left: number; top: number; height: number } | null;
    allowed: boolean;
  } | null>(null);
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window !== "undefined"
      ? isDesktopFootnoteSurface(window.innerWidth)
      : true
  );

  useEffect(() => {
    stickyRef.current = sticky;
  }, [sticky]);
  useEffect(() => {
    pinnedRef.current = pinned;
  }, [pinned]);
  useEffect(() => {
    openRef.current = open;
  }, [open]);
  useEffect(() => {
    function onResize() {
      setIsDesktop(isDesktopFootnoteSurface(window.innerWidth));
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const findSession = useSyncExternalStore(
    subscribeFootnoteFindSession,
    getFootnoteFindSession,
    () => null
  );
  const isFindTarget = findSession?.footnoteId === footnoteId;
  /** Find session or pin can keep the card visible without setState-in-effect. */
  const cardOpen = open || isFindTarget || pinned;

  const [cardPosition, setCardPosition] = useState<{
    left?: number;
    top?: number;
    width?: number;
    height?: number;
  }>(() => cardPositions.get(footnoteId) ?? {});
  const [cardZ, setCardZ] = useState(() =>
    autoOpenedFootnoteIds.has(footnoteId) ? claimFloatZ() : 40
  );
  const content = String(node.attrs.content ?? "");
  // Pin or drag freezes placement; auto-placement follows the ref until then.
  const hasUserPlacedPosition = cardPositions.has(footnoteId);
  const { prefs } = useEditorPrefs();
  const essaySpell = useEssaySpellcheck();
  // Footnote cards stay on browser-off; Harper currently covers the essay body.
  const spellLang = essaySpell.lang;

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

  const noteEditor = useEditor(
    {
      extensions: createFootnoteExtensions({
        typography: prefs.typography,
      }),
      content,
      contentType: "markdown",
      immediatelyRender: false,
      editorProps: {
        attributes: {
          class: "footnote-card-editor outline-none",
          "aria-label": `Footnote ${number} content`,
          spellcheck: "false",
          lang: spellLang,
        },
        handlePaste: (_view, event) => {
          if (firstImageFile(event.clipboardData?.files)) {
            event.preventDefault();
            return true;
          }
          return false;
        },
        handleDrop: (_view, event) => {
          if (firstImageFile(event.dataTransfer?.files)) {
            event.preventDefault();
            return true;
          }
          return false;
        },
      },
    },
    [prefs.typography]
  );

  useEffect(() => {
    if (!noteEditor) return;
    applyEditorDomLang(noteEditor.view.dom as HTMLElement, spellLang);
  }, [noteEditor, spellLang]);

  useEffect(() => {
    if (!autoOpenedFootnoteIds.has(footnoteId) || !noteEditor || !cardOpen) {
      return;
    }
    autoOpenedFootnoteIds.delete(footnoteId);
    dragSuppressUntil.current = performance.now() + 280;
    requestAnimationFrame(() => {
      noteEditor.commands.focus("end");
    });
  }, [noteEditor, cardOpen, footnoteId]);

  // Highlight inside the note while this footnote is the active find target.
  useEffect(() => {
    if (!noteEditor) return;
    if (!cardOpen || !isFindTarget || !findSession) {
      clearFindHighlights(noteEditor);
      return;
    }
    let matches;
    try {
      matches = findInEditor(
        noteEditor,
        {
          query: findSession.query,
          regex: findSession.regex,
          caseSensitive: findSession.caseSensitive,
        },
        "document"
      );
    } catch {
      clearFindHighlights(noteEditor);
      return;
    }
    if (matches.length === 0) {
      clearFindHighlights(noteEditor);
      return;
    }
    const activeIndex = Math.min(
      findSession.occurrence,
      matches.length - 1
    );
    setFindHighlights(noteEditor, matches, activeIndex);
    const active = matches[activeIndex];
    if (active) {
      requestAnimationFrame(() => {
        scrollMatchIntoView(noteEditor, active);
      });
    }
  }, [noteEditor, cardOpen, isFindTarget, findSession]);

  useEffect(() => {
    if (!noteEditor || !cardOpen) return;
    const current = noteEditor;
    function onClick(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest("a[href]");
      if (!anchor || !current.view.dom.contains(anchor)) return;
      const href = (anchor as HTMLAnchorElement).getAttribute("href") || "";
      event.preventDefault();
      window.requestAnimationFrame(() => {
        openLinkEditor(current, { allowPreview: true, href });
      });
    }
    const dom = current.view.dom;
    dom.addEventListener("click", onClick);
    return () => dom.removeEventListener("click", onClick);
  }, [noteEditor, cardOpen]);

  useEffect(() => {
    if (!noteEditor) return;
    if (
      !shouldApplyExternalFootnoteContent({
        incoming: content,
        editorMarkdown: noteEditor.getMarkdown(),
        isFocused: noteEditor.isFocused,
      })
    ) {
      return;
    }
    noteEditor.chain()
      .command(({ tr }) => {
        tr.setMeta("addToHistory", false);
        return true;
      })
      .setContent(content, {
        contentType: "markdown",
        emitUpdate: false,
      })
      .run();
  }, [content, noteEditor]);

  // Push edits into the node attrs so the margin sidenote stays live — debounced
  // so each keystroke does not rewrite the parent document.
  //
  // Only sync while the card is open. The nested editor mounts for every
  // footnote (even closed ones); an early empty getMarkdown() captured in the
  // debounce closure used to overwrite good attrs.content after paste / mode
  // switch — especially visible on the first link-heavy Substack note.
  const contentRef = useRef(content);
  const attrSyncTimer = useRef(0);
  useEffect(() => {
    contentRef.current = content;
  }, [content]);
  useEffect(() => {
    if (!noteEditor || !cardOpen) return;
    const sync = () => {
      const snapshot = noteEditor.getMarkdown().trim();
      if (snapshot === contentRef.current) return;
      if (attrSyncTimer.current) window.clearTimeout(attrSyncTimer.current);
      const delay = footnoteAttrSyncDelay(noteEditor.isFocused, snapshot);
      const commit = () => {
        attrSyncTimer.current = 0;
        const latest = noteEditor.getMarkdown().trim();
        if (
          !shouldCommitFootnoteAttrs({
            next: latest,
            current: contentRef.current,
            isFocused: noteEditor.isFocused,
          })
        ) {
          return;
        }
        updateAttributes({ content: latest });
      };
      if (delay === 0) {
        commit();
        return;
      }
      attrSyncTimer.current = window.setTimeout(commit, delay);
    };
    noteEditor.on("update", sync);
    return () => {
      noteEditor.off("update", sync);
      if (attrSyncTimer.current) window.clearTimeout(attrSyncTimer.current);
    };
  }, [noteEditor, cardOpen, updateAttributes]);

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
    if (getFootnoteFindSession()?.footnoteId === footnoteId) {
      setFootnoteFindSession(null);
    }
    stickyFootnoteIds.delete(footnoteId);
    pinnedFootnoteIds.delete(footnoteId);
    cardPositions.delete(footnoteId);
    setSticky(false);
    setPinned(false);
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
      // Find-opened cards stay until the find session moves on.
      if (getFootnoteFindSession()?.footnoteId === footnoteId) return;
      // Clicked or pinned cards stay; hover previews dismiss on leave.
      if (!stickyRef.current && !pinnedRef.current) {
        commitAndClose();
      }
    }, 140);
  }, [cancelHoverClose, commitAndClose, footnoteId]);

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
      const wasOpen = openRef.current || pinnedRef.current;
      setOpen(true);
      openRef.current = true;
      dragSuppressUntil.current = performance.now() + 280;
      const anchor = options?.anchorEl ?? buttonRef.current;
      if (
        anchor &&
        typeof window !== "undefined" &&
        isDesktop &&
        shouldRepositionFootnoteCard({
          alreadyOpen: wasOpen,
          pinned: pinnedRef.current,
          userPlaced: cardPositions.has(footnoteId),
        })
      ) {
        const rect = anchor.getBoundingClientRect();
        const size = {
          width: FOOTNOTE_CARD_WIDTH,
          height: FOOTNOTE_CARD_HEIGHT,
        };
        const editorBounds =
          buttonRef.current?.closest("main")?.getBoundingClientRect();
        const placed = placeFootnoteCard({
          refRect: rect,
          sidenoteRect: sidenoteRef.current?.getBoundingClientRect() ?? null,
          viewportWidth: window.innerWidth,
          viewportHeight: window.innerHeight,
          editorLeft: editorBounds?.left,
          editorRight: editorBounds?.right,
          cardWidth: size.width,
          cardHeight: size.height,
        });
        setCardPosition((current) => ({
          ...placed,
          width: current.width ?? size.width,
          height: current.height ?? size.height,
        }));
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
        requestAnimationFrame(() => {
          if (!noteEditor?.isFocused) noteEditor?.commands.focus("end");
        });
      }
    },
    [cancelHoverClose, footnoteId, isDesktop, noteEditor]
  );

  /** Freeze the floating card at its current viewport spot (pin or drag). */
  const freezeCardPosition = useCallback(() => {
    setCardPosition((current) => {
      const width = current.width ?? FOOTNOTE_CARD_WIDTH;
      const height = current.height ?? FOOTNOTE_CARD_HEIGHT;
      if (
        typeof current.left === "number" &&
        typeof current.top === "number"
      ) {
        const next = {
          left: current.left,
          top: current.top,
          width,
          height,
        };
        cardPositions.set(footnoteId, next);
        return next;
      }
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) return { ...current, width, height };
      const editorBounds =
        buttonRef.current?.closest("main")?.getBoundingClientRect();
      const placed = placeFootnoteCard({
        refRect: rect,
        sidenoteRect: sidenoteRef.current?.getBoundingClientRect() ?? null,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        editorLeft: editorBounds?.left,
        editorRight: editorBounds?.right,
        cardWidth: width,
        cardHeight: height,
      });
      const next = { ...placed, width, height };
      cardPositions.set(footnoteId, next);
      return next;
    });
  }, [footnoteId]);

  const togglePinned = useCallback(() => {
    setPinned((currentlyPinned) => {
      const next = !currentlyPinned;
      if (next) {
        pinnedFootnoteIds.add(footnoteId);
        stickyFootnoteIds.add(footnoteId);
        setSticky(true);
        // Snapshot now so scroll handlers stop tracking the superscript.
        freezeCardPosition();
      } else {
        pinnedFootnoteIds.delete(footnoteId);
        // Stay where it is. Unpin only means the next click in the essay closes it.
      }
      return next;
    });
  }, [footnoteId, freezeCardPosition]);

  useEffect(() => {
    if (!cardOpen) return;
    function positionCard() {
      setCardPosition((current) => {
        if (window.innerWidth < 768) {
          return {};
        }
        if (
          !shouldFollowFootnoteRef({
            pinned: pinnedRef.current,
            userPlaced: hasUserPlacedPosition,
          })
        ) {
          return current;
        }
        const rect = buttonRef.current?.getBoundingClientRect();
        if (!rect) return current;
        const cardWidth = current.width ?? FOOTNOTE_CARD_WIDTH;
        const cardHeight = current.height ?? FOOTNOTE_CARD_HEIGHT;
        const editorBounds =
          buttonRef.current?.closest("main")?.getBoundingClientRect();
        const placed = placeFootnoteCard({
          refRect: rect,
          sidenoteRect: sidenoteRef.current?.getBoundingClientRect() ?? null,
          viewportWidth: window.innerWidth,
          viewportHeight: window.innerHeight,
          editorLeft: editorBounds?.left,
          editorRight: editorBounds?.right,
          cardWidth,
          cardHeight,
        });
        return { ...placed, width: cardWidth, height: cardHeight };
      });
    }
    positionCard();
    window.addEventListener("resize", positionCard);
    window.addEventListener("scroll", positionCard, true);
    return () => {
      window.removeEventListener("resize", positionCard);
      window.removeEventListener("scroll", positionCard, true);
    };
  }, [cardOpen, hasUserPlacedPosition, pinned]);

  useEffect(() => {
    if (!noteEditor || !cardOpen) return;
    const historyEditor = noteEditor;
    function onKeyDown(event: KeyboardEvent) {
      const action = footnoteHistoryAction(event);
      if (!action) return;
      if (!isFootnoteHistoryTarget(event.target, footnoteId)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      applyFootnoteHistoryKey(historyEditor, action);
    }
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [noteEditor, cardOpen, footnoteId]);

  useEffect(() => {
    if (!cardOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      // Find session owns Escape while this card is the active find target.
      if (isFindTarget) return;
      event.preventDefault();
      commitAndClose();
      outerEditor.commands.focus();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [commitAndClose, cardOpen, isFindTarget, outerEditor]);

  useEffect(() => {
    // Pinned cards ignore outside clicks. Hover-only and click-sticky both
    // dismiss on outside pointer (hover also dismisses on mouse leave).
    // Defer attaching so the same gesture that opened the card cannot close it
    // (important when opening from a sticky sidenote while the ref is off-screen).
    if (!cardOpen || pinned || isFindTarget) return;
    function closeOnOutsidePointer(event: PointerEvent) {
      if (isFootnoteOutsidePointerTarget(event.target, footnoteId)) {
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
  }, [commitAndClose, footnoteId, cardOpen, pinned, isFindTarget]);

  useEffect(() => {
    return () => {
      if (hoverCloseTimer.current) clearTimeout(hoverCloseTimer.current);
      document.body.classList.remove(
        "is-dragging-footnote-ref",
        "is-footnote-drop-blocked"
      );
    };
  }, []);

  const endRefDrag = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      const drag = refDrag.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      const wasDragging = drag.dragging;
      refDrag.current = null;
      document.body.classList.remove(
        "is-dragging-footnote-ref",
        "is-footnote-drop-blocked"
      );
      setRefDragGhost(null);
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        /* already released */
      }
      if (!wasDragging) return;
      event.preventDefault();
      const from = getPos();
      if (typeof from !== "number") return;
      const dropPos = footnoteDropPosFromCoords(
        outerEditor.view,
        event.clientX,
        event.clientY
      );
      if (dropPos == null) return;
      if (isNoOpFootnoteMove(from, node.nodeSize, dropPos)) return;
      commitContent();
      outerEditor.commands.moveFootnoteRef(from, dropPos);
    },
    [commitContent, getPos, node.nodeSize, outerEditor]
  );

  const beginRefDrag = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      if (event.button !== 0) return;
      refDrag.current = {
        pointerId: event.pointerId,
        originX: event.clientX,
        originY: event.clientY,
        dragging: false,
      };
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        /* jsdom / already captured */
      }
    },
    []
  );

  const onRefDragMove = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      const drag = refDrag.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      if (!drag.dragging) {
        if (
          !shouldStartPointerDrag(
            { x: drag.originX, y: drag.originY },
            { x: event.clientX, y: event.clientY }
          )
        ) {
          return;
        }
        drag.dragging = true;
        skipClickAfterDrag.current = true;
        document.body.classList.add("is-dragging-footnote-ref");
        event.preventDefault();
      }
      const from = getPos();
      const dropPos =
        typeof from === "number"
          ? footnoteDropPosFromCoords(
              outerEditor.view,
              event.clientX,
              event.clientY
            )
          : null;
      const allowed =
        typeof from === "number" &&
        dropPos != null &&
        !isNoOpFootnoteMove(from, node.nodeSize, dropPos);
      document.body.classList.toggle("is-footnote-drop-blocked", !allowed);
      setRefDragGhost({
        x: event.clientX,
        y: event.clientY,
        caret:
          allowed && dropPos != null
            ? caretCoordsAtPos(outerEditor.view, dropPos)
            : null,
        allowed,
      });
    },
    [getPos, node.nodeSize, outerEditor]
  );

  const moveCard = useCallback(
    (left: number, top: number) => {
      setCardPosition((current) => {
        const next = {
          left,
          top,
          width: current.width ?? FOOTNOTE_CARD_WIDTH,
          height: current.height ?? FOOTNOTE_CARD_HEIGHT,
        };
        cardPositions.set(footnoteId, next);
        return next;
      });
    },
    [footnoteId]
  );

  const resizeCard = useCallback(
    (width: number, height: number) => {
      setCardPosition((current) => {
        const next = {
          left: current.left ?? 72,
          top: current.top ?? 72,
          width,
          height,
        };
        cardPositions.set(footnoteId, next);
        return next;
      });
    },
    [footnoteId]
  );

  const editorBody = (
    <>
      {noteEditor && <FootnoteToolbar editor={noteEditor} />}
      <EditorContent
        editor={noteEditor}
        className="footnote-card-editor-shell"
      />
    </>
  );

  return (
    <NodeViewWrapper
      as="span"
      data-footnote-id={footnoteId}
      className={`footnote-node ${selected ? "is-selected" : ""}`}
    >
      <button
        ref={buttonRef}
        type="button"
        className={`footnote-ref${refDragGhost ? " is-dragging" : ""}`}
        aria-label={`Edit footnote ${number}. Drag to move.`}
        aria-expanded={cardOpen}
        aria-grabbed={refDragGhost ? true : undefined}
        draggable={false}
        onPointerDown={beginRefDrag}
        onPointerMove={onRefDragMove}
        onPointerUp={endRefDrag}
        onPointerCancel={endRefDrag}
        onMouseEnter={() => {
          if (refDrag.current?.dragging) return;
          if (prefs.footnoteOpenOnHover) {
            openCard({ focusEditor: false, sticky: false });
          }
        }}
        onMouseLeave={() => {
          if (refDrag.current?.dragging) return;
          if (prefs.footnoteOpenOnHover) scheduleHoverClose();
        }}
        onClick={(event) => {
          if (skipClickAfterDrag.current) {
            skipClickAfterDrag.current = false;
            event.preventDefault();
            event.stopPropagation();
            return;
          }
          openCard({ sticky: true });
        }}
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

      {cardOpen &&
        typeof document !== "undefined" &&
        (isDesktop ? (
          <PinnedSurface
            title={`Footnote ${number}`}
            left={cardPosition.left ?? 72}
            top={cardPosition.top ?? 72}
            width={cardPosition.width ?? FOOTNOTE_CARD_WIDTH}
            height={cardPosition.height ?? FOOTNOTE_CARD_HEIGHT}
            zIndex={cardZ}
            className="footnote-pin"
            closeLabel="Close footnote"
            minWidth={FOOTNOTE_CARD_MIN_WIDTH}
            minHeight={FOOTNOTE_CARD_MIN_HEIGHT}
            dataAttributes={{ "data-footnote-id": footnoteId }}
            onClose={commitAndClose}
            onRaise={() => {
              stickyFootnoteIds.add(footnoteId);
              setSticky(true);
              setCardZ(claimFloatZ());
            }}
            onDragStart={freezeCardPosition}
            canBeginDrag={() => performance.now() >= dragSuppressUntil.current}
            onMove={moveCard}
            onResize={resizeCard}
            onMouseEnter={cancelHoverClose}
            onMouseLeave={() => {
              if (prefs.footnoteOpenOnHover) scheduleHoverClose();
            }}
            headerActions={
              <button
                type="button"
                className="pinned-surface-btn"
                onClick={togglePinned}
                aria-pressed={pinned}
                title={pinned ? "Unpin footnote" : "Pin footnote"}
                aria-label={pinned ? "Unpin footnote" : "Pin footnote"}
              >
                <PinIcon />
              </button>
            }
          >
            {editorBody}
          </PinnedSurface>
        ) : (
          createPortal(
            <span
              className="footnote-card"
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
                stickyFootnoteIds.add(footnoteId);
                setSticky(true);
                setCardZ(claimFloatZ());
              }}
            >
              <span className="footnote-card-heading">
                <span className="footnote-card-title">
                  <span>Footnote {number}</span>
                </span>
                <span className="footnote-card-actions">
                  <button
                    type="button"
                    onClick={commitAndClose}
                    aria-label="Close footnote editor"
                  >
                    Done
                  </button>
                </span>
              </span>
              {editorBody}
            </span>,
            document.body
          )
        ))}

      {refDragGhost &&
        typeof document !== "undefined" &&
        createPortal(
          <>
            <span
              className="footnote-ref footnote-ref-ghost"
              aria-hidden
              style={{
                left: refDragGhost.x,
                top: refDragGhost.y,
              }}
            >
              {number}
            </span>
            {refDragGhost.caret && (
              <span
                className="footnote-drop-caret"
                aria-hidden
                style={{
                  left: refDragGhost.caret.left,
                  top: refDragGhost.caret.top,
                  height: refDragGhost.caret.height,
                }}
              />
            )}
          </>,
          document.body
        )}
    </NodeViewWrapper>
  );
}
