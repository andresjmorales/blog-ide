"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import type { Editor } from "@tiptap/core";
import { fetchLinkPreview } from "@/lib/preview/client";
import type { LinkPreview } from "@/lib/preview/openGraph";
import { openLinkPin } from "@/lib/pins/pinStore";
import { claimFloatZ } from "@/lib/pins/pinStore";
import { AddToLibraryButton } from "@/components/library/AddToLibraryButton";
import {
  setLinkEditorOpener,
  type LinkEditorOpenOptions,
} from "@/lib/editor/linkShortcut";
import { placeLinkBubble } from "@/lib/editor/linkPlacement";

type CardState = {
  activeEditor: Editor;
  href: string;
  left: number;
  top: number;
  zIndex: number;
  /** When false, hide OG preview until the user pastes/applies a URL (Ctrl+K). */
  allowPreview: boolean;
  /** Place above the link (CSS translateY -100%) vs below. */
  placeAbove: boolean;
  /** Full-width bottom sheet on narrow viewports. */
  mobileSheet: boolean;
  /** Focus the URL input (keyboard/toolbar open only). */
  focusUrl: boolean;
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

function placeNearRect(
  rect: DOMRect,
  estimatedHeight: number
): { left: number; top: number; placeAbove: boolean; mobileSheet: boolean } {
  return placeLinkBubble(rect, estimatedHeight);
}

/**
 * Docs-style link bubble: URL field + Clear / Copy / Apply.
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
  const [preview, setPreview] = useState<LinkPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const activeEditorRef = useRef<Editor | null>(null);

  useEffect(() => {
    activeEditorRef.current = card?.activeEditor ?? null;
  }, [card]);

  const close = useCallback(() => {
    const active = activeEditorRef.current;
    setCard(null);
    setPreview(null);
    setPreviewError(null);
    setPreviewLoading(false);
    // Return focus to the editor that owned the bubble (main or footnote).
    if (active && !active.isDestroyed) {
      window.requestAnimationFrame(() => {
        active.commands.focus();
      });
    }
  }, []);

  const loadPreview = useCallback((url: string) => {
    const trimmed = url.trim();
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
        setPreview(next);
        setPreviewLoading(false);
      })
      .catch((err: unknown) => {
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
      const estimatedHeight = allowPreview ? 260 : 120;
      const pos = placeNearRect(rect, estimatedHeight);
      setDraft(href);
      setPreview(null);
      setPreviewError(null);
      setPreviewLoading(false);
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
      });
      if (allowPreview) {
        window.setTimeout(() => loadPreview(href), 0);
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
      window.requestAnimationFrame(() => {
        openAt(current, { allowPreview: true, href });
      });
    }

    const dom = current.view.dom;
    dom.addEventListener("click", onClick);
    return () => dom.removeEventListener("click", onClick);
  }, [editor, openAt]);

  useLayoutEffect(() => {
    if (!card?.focusUrl) return;
    inputRef.current?.focus();
    inputRef.current?.select();
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
      active.chain().extendMarkRange("link").unsetLink().run();
      close();
      return;
    }
    const chain = active.chain();
    if (active.isActive("link")) chain.extendMarkRange("link");
    chain.setLink({ href: url }).run();
    // Drop link from stored marks so the next keystrokes aren't linked.
    active.commands.command(({ tr, dispatch }) => {
      if (!dispatch) return true;
      const marks = (
        tr.storedMarks ?? tr.selection.$from.marks()
      ).filter((mark) => mark.type.name !== "link");
      dispatch(tr.setStoredMarks(marks));
      return true;
    });

    if (options?.keepOpen) {
      setCard((current) =>
        current ? { ...current, href: url, allowPreview: true } : current
      );
      setDraft(url);
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
    } catch {
      // ignore clipboard failures
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
      className={`link-edit-card${card.placeAbove ? " is-above" : ""}${
        card.mobileSheet ? " is-mobile-sheet" : ""
      }`}
      style={
        card.mobileSheet
          ? { zIndex: card.zIndex }
          : { left: card.left, top: card.top, zIndex: card.zIndex }
      }
      onMouseDown={(event) => event.stopPropagation()}
    >
      <div className="link-edit-row">
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
      </div>
      <div className="link-edit-actions">
        <button type="button" onClick={() => applyHref(draft)}>
          Apply
        </button>
        <button type="button" onClick={() => void copyHref()}>
          Copy
        </button>
        <button type="button" onClick={clearLink}>
          Clear
        </button>
      </div>

      {showPreviewChrome && (
        <div className="link-edit-preview">
          {previewLoading && (
            <p className="link-hover-meta">Loading preview…</p>
          )}
          {previewError && <p className="link-hover-error">{previewError}</p>}
          {preview && (
            <>
              {preview.image && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={preview.image}
                  alt=""
                  className="link-hover-image"
                  loading="lazy"
                  referrerPolicy="no-referrer"
                />
              )}
              {preview.siteName && (
                <p className="link-hover-site">{preview.siteName}</p>
              )}
              <p className="link-hover-title">{preview.title}</p>
              {preview.description && (
                <p className="link-hover-desc">{preview.description}</p>
              )}
            </>
          )}
          {!previewLoading && !preview && !previewError && resolvedUrl && (
            <p className="link-hover-title">{resolvedUrl}</p>
          )}
          {hasHttpUrl && (
            <div className="link-hover-actions">
              <a href={resolvedUrl} target="_blank" rel="noreferrer">
                Open
              </a>
              <button
                type="button"
                onClick={() => {
                  openLinkPin({
                    url: resolvedUrl,
                    title,
                    description: preview?.description,
                    siteName: preview?.siteName,
                    image: preview?.image,
                  });
                  close();
                }}
              >
                Pin
              </button>
              <AddToLibraryButton
                url={resolvedUrl}
                title={title}
                variant="hover"
              />
            </div>
          )}
        </div>
      )}
    </div>,
    document.body
  );
}
