"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { getMarkRange, type Editor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import { fetchLinkPreview } from "@/lib/preview/client";
import type { LinkPreview } from "@/lib/preview/openGraph";
import { openLinkPin } from "@/lib/pins/pinStore";
import { claimFloatZ } from "@/lib/pins/pinStore";
import { showCopiedToast, showErrorToast } from "@/lib/ui/toast";
import { LinkPreviewSnippet } from "@/components/editor/LinkPreviewSnippet";
import { ClipboardIcon } from "@/components/icons";
import {
  setLinkEditorOpener,
  type LinkEditorOpenOptions,
} from "@/lib/editor/linkShortcut";
import {
  applyLinkHrefAndText,
  readLinkDisplayText,
} from "@/lib/editor/linkFields";
import {
  LINK_BUBBLE_HEIGHT_COMPACT_PX,
  LINK_BUBBLE_HEIGHT_PREVIEW_PX,
  placeLinkBubble,
} from "@/lib/editor/linkPlacement";

type CardState = {
  activeEditor: Editor;
  href: string;
  left: number;
  top: number;
  zIndex: number;
  /** When false, hide OG preview until the user pastes/applies a URL (Ctrl+K). */
  allowPreview: boolean;
  /** True when the bubble sits above the link instead of below. */
  placeAbove: boolean;
  /** Full-width bottom sheet on narrow viewports. */
  mobileSheet: boolean;
  /** Focus the URL input (Ctrl+K on selected prose / named links). */
  focusUrl: boolean;
  /** Focus the display-text input (Ctrl+K on a naked pasted URL). */
  focusText: boolean;
};

function anchorRectForLink(editor: Editor): DOMRect | null {
  const { from } = editor.state.selection;
  try {
    const dom = editor.view.domAtPos(from).node;
    const el =
      dom instanceof Element
        ? dom.closest("a[href]")
        : dom.parentElement?.closest("a[href]");
    if (el instanceof HTMLElement) return el.getBoundingClientRect();
  } catch {
    // fall through
  }
  try {
    const coords = editor.view.coordsAtPos(from);
    return new DOMRect(coords.left, coords.top, 0, coords.bottom - coords.top);
  } catch {
    return null;
  }
}

/**
 * Doc position inside the tapped/clicked link. Prefers the pointer coords,
 * falling back to the anchor's start when the coords land outside the mark.
 */
function linkPosFromClick(
  editor: Editor,
  anchor: Element,
  event: MouseEvent
): number | null {
  const { view, state } = editor;
  const type = state.schema.marks.link;
  if (!type) return null;
  const candidates: number[] = [];
  try {
    const hit = view.posAtCoords({ left: event.clientX, top: event.clientY });
    if (hit) candidates.push(hit.pos);
  } catch {
    // no layout (e.g. coords off-screen)
  }
  try {
    candidates.push(view.posAtDOM(anchor, 0));
  } catch {
    // anchor not mapped
  }
  for (const pos of candidates) {
    if (pos < 0 || pos > state.doc.content.size) continue;
    if (getMarkRange(state.doc.resolve(pos), type)) return pos;
  }
  return null;
}

/**
 * Touch browsers sync the native caret into ProseMirror after `click` (often
 * a frame or more later), so the editor selection can still sit outside the
 * tapped link. Move it into the link so text/range reads match the tap.
 */
function selectTappedLink(editor: Editor, pos: number) {
  if (editor.isDestroyed) return;
  const { state } = editor;
  const type = state.schema.marks.link;
  if (!type || pos > state.doc.content.size) return;
  const target = getMarkRange(state.doc.resolve(pos), type);
  if (!target) return;
  const current = getMarkRange(state.selection.$from, type);
  if (
    current &&
    current.from === target.from &&
    current.to === target.to &&
    state.selection.to <= target.to
  ) {
    return;
  }
  // Strictly inside the mark: links are non-inclusive, so an edge caret
  // would not count as "in" the link for Clear / getAttributes.
  const inside =
    target.to - target.from > 1
      ? Math.min(Math.max(pos, target.from + 1), target.to - 1)
      : pos;
  editor.view.dispatch(
    state.tr.setSelection(TextSelection.create(state.doc, inside))
  );
}

function placeNearRect(
  rect: DOMRect,
  estimatedHeight: number
): { left: number; top: number; placeAbove: boolean; mobileSheet: boolean } {
  return placeLinkBubble(rect, estimatedHeight);
}

/**
 * Docs-style link bubble: display text + URL + Apply / Clear.
 * Preview loads only after a URL is applied or pasted (not on empty Ctrl+K).
 * Opens on Ctrl+K / toolbar, or when clicking an existing link in the editor.
 *
 * Tracks the editor that opened the bubble so nested footnote editors work.
 */
export function LinkEditCard({
  editor,
  showPreviews = true,
}: {
  editor: Editor | null;
  /** When false, skip OG preview chrome (prefs.linkPreviews off). */
  showPreviews?: boolean;
}) {
  const [card, setCard] = useState<CardState | null>(null);
  const [draft, setDraft] = useState("");
  const [textDraft, setTextDraft] = useState("");
  const [preview, setPreview] = useState<LinkPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const textInputRef = useRef<HTMLInputElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const activeEditorRef = useRef<Editor | null>(null);
  const textDirtyRef = useRef(false);
  /** Bumped per preview request so a slow response cannot land on a newer card. */
  const previewReqRef = useRef(0);

  useEffect(() => {
    activeEditorRef.current = card?.activeEditor ?? null;
  }, [card]);

  const close = useCallback(() => {
    const active = activeEditorRef.current;
    previewReqRef.current += 1;
    setCard(null);
    setPreview(null);
    setPreviewError(null);
    setPreviewLoading(false);
    textDirtyRef.current = false;
    // Return focus to the editor that owned the bubble (main or footnote).
    if (active && !active.isDestroyed) {
      window.requestAnimationFrame(() => {
        active.commands.focus();
      });
    }
  }, []);

  const loadPreview = useCallback((url: string) => {
    const trimmed = url.trim();
    const req = ++previewReqRef.current;
    if (!trimmed.startsWith("http")) {
      setPreview(null);
      setPreviewError(null);
      setPreviewLoading(false);
      return;
    }
    setPreviewLoading(true);
    setPreviewError(null);
    void fetchLinkPreview(trimmed)
      .then((next) => {
        if (req !== previewReqRef.current) return;
        setPreview(next);
        setPreviewLoading(false);
      })
      .catch((err: unknown) => {
        if (req !== previewReqRef.current) return;
        setPreview(null);
        setPreviewLoading(false);
        setPreviewError(err instanceof Error ? err.message : "Preview failed");
      });
  }, []);

  const openAt = useCallback(
    (nextEditor: Editor, options: LinkEditorOpenOptions = {}) => {
      if (nextEditor.isDestroyed) return;
      const href =
        options.href ??
        (nextEditor.getAttributes("link").href as string | undefined) ??
        "";
      const rect = anchorRectForLink(nextEditor);
      if (!rect) return;
      const trimmedHref = href.trim();
      // Show OG + Open/Pin/Library whenever the bubble opens on an http(s) link
      // (click or Ctrl+K on an existing link). Empty Ctrl+K waits for paste/apply.
      const allowPreview =
        showPreviews &&
        trimmedHref.startsWith("http") &&
        options.allowPreview !== false;
      const estimatedHeight = allowPreview
        ? LINK_BUBBLE_HEIGHT_PREVIEW_PX
        : LINK_BUBBLE_HEIGHT_COMPACT_PX;
      const pos = placeNearRect(rect, estimatedHeight);
      const displayText = readLinkDisplayText(nextEditor);
      textDirtyRef.current = false;
      setDraft(href);
      setTextDraft(displayText);
      setPreview(null);
      setPreviewError(null);
      setPreviewLoading(allowPreview);
      setCard({
        activeEditor: nextEditor,
        href,
        left: pos.left,
        top: pos.top,
        zIndex: claimFloatZ(),
        allowPreview,
        placeAbove: pos.placeAbove,
        mobileSheet: pos.mobileSheet,
        focusUrl: options.focusUrl === true,
        focusText: options.focusText === true,
      });
      if (allowPreview) {
        loadPreview(href);
      }
    },
    [loadPreview, showPreviews]
  );

  useEffect(() => {
    setLinkEditorOpener((target, options) => {
      openAt(target, options ?? {});
    });
    return () => setLinkEditorOpener(null);
  }, [openAt]);

  useEffect(() => {
    if (!editor) return;
    const current = editor;

    function onClick(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest("a[href]");
      if (!anchor || !current.view.dom.contains(anchor)) return;
      const href = (anchor as HTMLAnchorElement).getAttribute("href") || "";
      // Resolve from the event now; on mobile the editor selection may not
      // have caught up with the tap yet (blank Text field on first tap).
      const pos = linkPosFromClick(current, anchor, event);
      if (pos !== null) selectTappedLink(current, pos);
      window.requestAnimationFrame(() => {
        if (pos !== null) selectTappedLink(current, pos);
        openAt(current, { allowPreview: true, href });
      });
    }

    const dom = current.view.dom;
    dom.addEventListener("click", onClick);
    return () => dom.removeEventListener("click", onClick);
  }, [editor, openAt]);

  useLayoutEffect(() => {
    if (!card) return;
    if (card.focusUrl) {
      inputRef.current?.focus();
      inputRef.current?.select();
    } else if (card.focusText) {
      textInputRef.current?.focus();
      textInputRef.current?.select();
    }
  }, [card]);

  const applyMeasuredPlacement = useCallback(
    (active: Editor, options?: { preferCurrentSide?: boolean }) => {
      const el = cardRef.current;
      if (!el || active.isDestroyed) return;
      const rect = anchorRectForLink(active);
      if (!rect) return;
      setCard((current) => {
        if (!current) return current;
        const pos = placeLinkBubble(
          rect,
          el.offsetHeight,
          undefined,
          el.offsetWidth,
          options?.preferCurrentSide
            ? { preferAbove: current.placeAbove }
            : undefined
        );
        if (
          current.left === pos.left &&
          current.top === pos.top &&
          current.placeAbove === pos.placeAbove &&
          current.mobileSheet === pos.mobileSheet
        ) {
          return current;
        }
        return {
          ...current,
          left: pos.left,
          top: pos.top,
          placeAbove: pos.placeAbove,
          mobileSheet: pos.mobileSheet,
        };
      });
    },
    []
  );

  const placementKey = card
    ? `${card.href}|${String(card.allowPreview)}|${card.mobileSheet ? "m" : "d"}`
    : "";

  // placementKey is the open identity; omit `card` so left/top updates do not flip.
  useLayoutEffect(() => {
    if (!card || card.mobileSheet) return;
    applyMeasuredPlacement(card.activeEditor);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- card identity is placementKey
  }, [placementKey, applyMeasuredPlacement]);

  useLayoutEffect(() => {
    if (!card || card.mobileSheet) return;
    applyMeasuredPlacement(card.activeEditor, { preferCurrentSide: true });
  }, [card, preview, previewLoading, applyMeasuredPlacement]);

  useEffect(() => {
    if (!card || card.mobileSheet) return;
    const active = card.activeEditor;
    function reposition() {
      applyMeasuredPlacement(active);
    }
    window.addEventListener("resize", reposition);
    const scrollRoot = active.view.dom.closest(
      "[data-blogide-editor-scroll]"
    );
    scrollRoot?.addEventListener("scroll", reposition, { passive: true });
    document.addEventListener("scroll", reposition, {
      capture: true,
      passive: true,
    });
    return () => {
      window.removeEventListener("resize", reposition);
      scrollRoot?.removeEventListener("scroll", reposition);
      document.removeEventListener("scroll", reposition, { capture: true });
    };
  }, [card, applyMeasuredPlacement]);

  useEffect(() => {
    if (!card) return;
    const active = card.activeEditor;
    function syncDisplayText() {
      if (active.isDestroyed) return;
      if (textDirtyRef.current) return;
      if (document.activeElement === textInputRef.current) return;
      setTextDraft(readLinkDisplayText(active));
    }
    active.on("update", syncDisplayText);
    return () => {
      active.off("update", syncDisplayText);
    };
  }, [card]);

  useEffect(() => {
    if (!card) return;
    const active = card.activeEditor;
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (cardRef.current?.contains(target)) return;
      // Keep open when clicking a link in the active editor — click updates it.
      if (
        target instanceof Element &&
        !active.isDestroyed &&
        active.view.dom.contains(target) &&
        target.closest("a[href]")
      ) {
        return;
      }
      close();
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      }
    }
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [card, close]);

  function applyHref(raw: string, options?: { keepOpen?: boolean }) {
    const active = card?.activeEditor;
    if (!active || active.isDestroyed) return;
    const url = raw.trim();
    // Do not sync-focus the editor here. Enter in the URL field must not land
    // in ProseMirror (that deletes the selected link text and inserts a newline).
    // close() returns focus on the next animation frame.
    if (!url) {
      applyLinkHrefAndText(active, "", textDraft);
      close();
      return;
    }
    applyLinkHrefAndText(active, url, textDraft);

    if (options?.keepOpen) {
      setCard((current) =>
        current ? { ...current, href: url, allowPreview: true } : current
      );
      setDraft(url);
      if (!textDirtyRef.current) {
        setTextDraft(readLinkDisplayText(active));
      }
      if (showPreviews) loadPreview(url);
      return;
    }
    close();
  }

  async function copyHref() {
    const value = draft.trim() || card?.href || "";
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      showCopiedToast("Copied URL.");
    } catch (err) {
      showErrorToast(err, "Could not copy to the clipboard.", "clipboard-copy");
    }
  }

  async function copyText() {
    const value = textDraft.trim();
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      showCopiedToast("Copied link text.");
    } catch (err) {
      showErrorToast(err, "Could not copy to the clipboard.", "clipboard-copy");
    }
  }

  function clearLink() {
    const active = card?.activeEditor;
    if (!active || active.isDestroyed) return;
    active.chain().focus().extendMarkRange("link").unsetLink().run();
    close();
  }

  if (!card || typeof document === "undefined") return null;

  const resolvedUrl = draft.trim() || card.href;
  const title = preview?.title || resolvedUrl;
  const hasHttpUrl = resolvedUrl.startsWith("http");
  // Preview chrome: after open-with-href / paste, or once an http URL is in the field.
  const showPreviewChrome =
    showPreviews && (card.allowPreview || hasHttpUrl);

  return createPortal(
    <div
      ref={cardRef}
      className={`link-edit-card${
        card.mobileSheet ? " is-mobile-sheet" : ""
      }`}
      style={
        card.mobileSheet
          ? { zIndex: card.zIndex }
          : { left: card.left, top: card.top, zIndex: card.zIndex }
      }
      onPointerDown={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <div className="link-edit-row">
        <span className="link-edit-field-label">Text</span>
        <div className="link-edit-field">
          <input
            ref={textInputRef}
            type="text"
            className="link-edit-input"
            value={textDraft}
            placeholder="Text"
            aria-label="Link text"
            onChange={(event) => {
              textDirtyRef.current = true;
              setTextDraft(event.target.value);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                event.stopPropagation();
                applyHref(draft);
              }
            }}
          />
          <button
            type="button"
            className="link-edit-copy-btn"
            title="Copy text"
            aria-label="Copy text"
            onClick={() => void copyText()}
          >
            <ClipboardIcon />
          </button>
        </div>
      </div>
      <div className="link-edit-row">
        <span className="link-edit-field-label">URL</span>
        <div className="link-edit-field">
          <input
            ref={inputRef}
            type="url"
            className="link-edit-input"
            value={draft}
            placeholder="Paste or type a link"
            aria-label="Link URL"
            onChange={(event) => setDraft(event.target.value)}
            onPaste={(event) => {
              const text = event.clipboardData.getData("text");
              if (!text.trim()) return;
              event.preventDefault();
              setDraft(text.trim());
              // Keep open with preview so the paste can be verified (Docs-style).
              applyHref(text, { keepOpen: true });
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                // Confirm the URL only — never let Enter reach the document editor.
                event.preventDefault();
                event.stopPropagation();
                applyHref(draft);
              }
            }}
          />
          <button
            type="button"
            className="link-edit-copy-btn"
            title="Copy URL"
            aria-label="Copy URL"
            onClick={() => void copyHref()}
          >
            <ClipboardIcon />
          </button>
        </div>
      </div>
      <div className="link-edit-actions">
        <button type="button" onClick={() => applyHref(draft)}>
          Apply
        </button>
        <button type="button" onClick={clearLink}>
          Clear
        </button>
      </div>

      {showPreviewChrome && hasHttpUrl && (
        <div className="link-edit-preview">
          <LinkPreviewSnippet
            url={resolvedUrl}
            preview={preview}
            loading={previewLoading}
            error={previewError}
            onPinAndRead={() => {
              openLinkPin({
                url: resolvedUrl,
                title,
                description: preview?.description,
                siteName: preview?.siteName,
                image: preview?.image,
                autoExtract: true,
              });
              close();
            }}
          />
        </div>
      )}
    </div>,
    document.body
  );
}
