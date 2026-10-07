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
import { TextSelection, type Transaction } from "@tiptap/pm/state";
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

function anchorRectForLink(editor: Editor, at?: number | null): DOMRect | null {
  const from = at ?? editor.state.selection.from;
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
 * Doc position inside the tapped/clicked link. The anchor element decides
 * which link; pointer coords only refine the caret within it, since on touch
 * they can resolve into a neighbouring link.
 */
function linkPosFromClick(
  editor: Editor,
  anchor: Element,
  event: MouseEvent
): number | null {
  const { view, state } = editor;
  const type = state.schema.marks.link;
  if (!type) return null;
  let anchorPos: number;
  try {
    anchorPos = view.posAtDOM(anchor, 0);
  } catch {
    return null;
  }
  if (anchorPos < 0 || anchorPos > state.doc.content.size) return null;
  const range = getMarkRange(state.doc.resolve(anchorPos), type);
  if (!range) return null;
  try {
    const hit = view.posAtCoords({ left: event.clientX, top: event.clientY });
    if (hit && hit.pos >= range.from && hit.pos <= range.to) return hit.pos;
  } catch {
    // no layout (e.g. coords off-screen)
  }
  return anchorPos;
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

/** Visible text of the link mark containing `pos`, or "" if none. */
function linkTextAt(editor: Editor, pos: number): string {
  const { state } = editor;
  const type = state.schema.marks.link;
  if (!type || pos < 0 || pos > state.doc.content.size) return "";
  const range = getMarkRange(state.doc.resolve(pos), type);
  return range ? state.doc.textBetween(range.from, range.to) : "";
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
  /**
   * Doc position inside the link a click/tap opened the bubble on, mapped
   * through edits. Text, Apply and Clear read this instead of the selection,
   * which touch browsers can move back to the previous link after a tap.
   */
  const linkPosRef = useRef<number | null>(null);

  useEffect(() => {
    activeEditorRef.current = card?.activeEditor ?? null;
  }, [card]);

  const close = useCallback(() => {
    const active = activeEditorRef.current;
    previewReqRef.current += 1;
    linkPosRef.current = null;
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
    (
      nextEditor: Editor,
      options: LinkEditorOpenOptions = {},
      linkPos: number | null = null
    ) => {
      if (nextEditor.isDestroyed) return;
      linkPosRef.current = linkPos;
      if (linkPos !== null) selectTappedLink(nextEditor, linkPos);
      const href =
        options.href ??
        (nextEditor.getAttributes("link").href as string | undefined) ??
        "";
      const rect = anchorRectForLink(nextEditor, linkPos);
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
      const displayText =
        linkPos !== null
          ? linkTextAt(nextEditor, linkPos)
          : readLinkDisplayText(nextEditor);
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
      const doc = current.state.doc;
      window.requestAnimationFrame(() => {
        if (current.isDestroyed) return;
        // Positions are only trusted against the doc they were read from.
        const stillValid = pos !== null && current.state.doc === doc;
        openAt(current, { allowPreview: true, href }, stillValid ? pos : null);
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
      const rect = anchorRectForLink(active, linkPosRef.current);
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
      const at = linkPosRef.current;
      setTextDraft(
        at !== null ? linkTextAt(active, at) : readLinkDisplayText(active)
      );
    }
    function mapLinkPos({ transaction }: { transaction: Transaction }) {
      const at = linkPosRef.current;
      if (at === null || !transaction.docChanged) return;
      // Bias left so a pos inside the link stays inside after edits within it.
      linkPosRef.current = transaction.mapping.map(at, -1);
    }
    active.on("transaction", mapLinkPos);
    active.on("update", syncDisplayText);
    return () => {
      active.off("transaction", mapLinkPos);
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

  function applyHref(
    raw: string,
    options?: { keepOpen?: boolean; text?: string }
  ) {
    const text = options?.text ?? textDraft;
    const active = card?.activeEditor;
    if (!active || active.isDestroyed) return;
    const url = raw.trim();
    // Do not sync-focus the editor here. Enter in the URL field must not land
    // in ProseMirror (that deletes the selected link text and inserts a newline).
    // close() returns focus on the next animation frame.
    const pinned = linkPosRef.current;
    let linkStart: number | null = null;
    if (pinned !== null) {
      selectTappedLink(active, pinned);
      const type = active.state.schema.marks.link;
      const range = type
        ? getMarkRange(active.state.doc.resolve(pinned), type)
        : undefined;
      linkStart = range?.from ?? null;
    }
    if (!url) {
      applyLinkHrefAndText(active, "", text);
      close();
      return;
    }
    applyLinkHrefAndText(active, url, text);
    // The replaced text maps interior positions out of the link; re-pin.
    if (linkStart !== null) linkPosRef.current = linkStart + 1;

    if (options?.keepOpen) {
      const sameUrl = card?.href === url;
      setCard((current) =>
        current ? { ...current, href: url, allowPreview: true } : current
      );
      setDraft(url);
      if (!textDirtyRef.current) {
        const at = linkPosRef.current;
        setTextDraft(
          at !== null ? linkTextAt(active, at) : readLinkDisplayText(active)
        );
      }
      // Re-applying the same URL (e.g. Use title) keeps the loaded preview.
      if (showPreviews && !(sameUrl && preview)) loadPreview(url);
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
    if (linkPosRef.current !== null) {
      selectTappedLink(active, linkPosRef.current);
    }
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
            currentText={textDraft}
            onUseTitle={(pageTitle) => {
              textDirtyRef.current = false;
              setTextDraft(pageTitle);
              applyHref(resolvedUrl, { keepOpen: true, text: pageTitle });
            }}
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
