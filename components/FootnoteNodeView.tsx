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
  NodeViewWrapper,
  useEditorState,
  type NodeViewProps,
} from "@tiptap/react";
import { PinIcon, TrashIcon } from "@/components/icons";
import { FootnoteSidenote } from "@/components/FootnoteSidenote";
import { footnoteIndexKey, footnoteNumberAt } from "@/lib/editor/footnoteNumbers";
import { useEditorPrefs } from "@/components/EditorPrefsContext";
import { useEssaySpellcheck } from "@/components/EssaySpellcheckContext";
import { claimFloatZ } from "@/lib/pins/pinStore";
import {
  getFootnoteFindSession,
  setFootnoteFindSession,
  subscribeFootnoteFindSession,
} from "@/lib/editor/footnoteFindBridge";
import { consumeFootnoteEditorOpen } from "@/lib/editor/footnoteOpen";
import { FootnoteNoteEditor } from "@/components/FootnoteNoteEditor";
import { PinnedSurface } from "@/components/pins/PinnedSurface";
import {
  FOOTNOTE_CARD_HEIGHT,
  FOOTNOTE_CARD_MIN_HEIGHT,
  FOOTNOTE_CARD_MIN_WIDTH,
  FOOTNOTE_CARD_WIDTH,
  isDesktopFootnoteSurface,
  isFootnoteOutsidePointerTarget,
  placeFootnoteCard,
  shouldFollowFootnoteRef,
  shouldRepositionFootnoteCard,
} from "@/lib/editor/footnoteCard";
import { HOVER_OPEN_DELAY_MS } from "@/lib/editor/hoverIntent";
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
  const hoverOpenTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
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
    selector: ({ editor }) =>
      footnoteNumberAt(
        editor.state.doc,
        typeof getPos() === "number" ? getPos() : null,
        footnoteId,
        footnoteIndexKey.getState(editor.state)
      ),
  });

  const pendingFocusRef = useRef(autoOpenedFootnoteIds.has(footnoteId));
  const commitRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (autoOpenedFootnoteIds.has(footnoteId)) {
      autoOpenedFootnoteIds.delete(footnoteId);
      pendingFocusRef.current = true;
    }
  }, [footnoteId]);

  const commitContent = useCallback(() => {
    commitRef.current?.();
  }, []);

  const cancelHoverOpen = useCallback(() => {
    if (hoverOpenTimer.current) {
      clearTimeout(hoverOpenTimer.current);
      hoverOpenTimer.current = null;
    }
  }, []);

  const deleteThisFootnote = useCallback(() => {
    if (hoverCloseTimer.current) {
      clearTimeout(hoverCloseTimer.current);
      hoverCloseTimer.current = null;
    }
    if (getFootnoteFindSession()?.footnoteId === footnoteId) {
      setFootnoteFindSession(null);
    }
    stickyFootnoteIds.delete(footnoteId);
    pinnedFootnoteIds.delete(footnoteId);
    cardPositions.delete(footnoteId);
    setSticky(false);
    setPinned(false);
    setOpen(false);
    outerEditor.commands.deleteFootnote(footnoteId);
  }, [footnoteId, outerEditor]);

  const commitAndClose = useCallback(() => {
    if (hoverCloseTimer.current) {
      clearTimeout(hoverCloseTimer.current);
      hoverCloseTimer.current = null;
    }
    cancelHoverOpen();
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
  }, [cancelHoverOpen, commitContent, footnoteId]);

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
      cancelHoverOpen();
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
        pendingFocusRef.current = true;
      }
    },
    [cancelHoverClose, cancelHoverOpen, footnoteId, isDesktop]
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
      if (hoverOpenTimer.current) clearTimeout(hoverOpenTimer.current);
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

  const editorBody = cardOpen ? (
    <FootnoteNoteEditor
      content={content}
      number={number}
      footnoteId={footnoteId}
      typography={prefs.typography}
      spellLang={spellLang}
      updateAttributes={updateAttributes}
      isFindTarget={isFindTarget}
      findSession={findSession}
      pendingFocusRef={pendingFocusRef}
      commitRef={commitRef}
      dragSuppressUntilRef={dragSuppressUntil}
    />
  ) : null;

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
          if (!prefs.footnoteOpenOnHover) return;
          cancelHoverClose();
          if (openRef.current || hoverOpenTimer.current) return;
          hoverOpenTimer.current = setTimeout(() => {
            hoverOpenTimer.current = null;
            openCard({ focusEditor: false, sticky: false });
          }, HOVER_OPEN_DELAY_MS);
        }}
        onMouseLeave={() => {
          if (refDrag.current?.dragging) return;
          cancelHoverOpen();
          if (prefs.footnoteOpenOnHover) scheduleHoverClose();
        }}
        onWheel={cancelHoverOpen}
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

      {!prefs.sidenotes && (
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
      )}

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
              <>
                <button
                  type="button"
                  className="pinned-surface-btn footnote-card-delete"
                  onClick={deleteThisFootnote}
                  title="Delete footnote"
                  aria-label="Delete footnote"
                >
                  <TrashIcon />
                </button>
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
              </>
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
                    className="footnote-card-delete"
                    onClick={deleteThisFootnote}
                    title="Delete footnote"
                    aria-label="Delete footnote"
                  >
                    <TrashIcon />
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
