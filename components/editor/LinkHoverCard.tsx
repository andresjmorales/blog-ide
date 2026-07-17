"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/core";
import { fetchLinkPreview } from "@/lib/preview/client";
import type { LinkPreview } from "@/lib/preview/openGraph";
import { openLinkPin } from "@/lib/pins/pinStore";

type CardState = {
  url: string;
  left: number;
  top: number;
  preview: LinkPreview | null;
  error: string | null;
  loading: boolean;
};

/**
 * Hovering an in-editor link shows an OG preview with Pin / Open.
 */
export function LinkHoverCard({ editor }: { editor: Editor | null }) {
  const [card, setCard] = useState<CardState | null>(null);
  const hideTimer = useRef(0);
  const showTimer = useRef(0);
  const cardRef = useRef<HTMLDivElement | null>(null);

  const hide = useCallback(() => {
    window.clearTimeout(hideTimer.current);
    window.clearTimeout(showTimer.current);
    setCard(null);
  }, []);

  const scheduleHide = useCallback(() => {
    window.clearTimeout(hideTimer.current);
    // Short grace so the cursor can reach Pin/Open without the card vanishing.
    hideTimer.current = window.setTimeout(() => setCard(null), 100);
  }, []);

  const cancelHide = useCallback(() => {
    window.clearTimeout(hideTimer.current);
  }, []);

  useEffect(() => {
    if (!editor) return;
    const root = editor.view.dom;

    function onOver(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest("a[href]") as HTMLAnchorElement | null;
      if (!anchor || !root.contains(anchor)) return;
      const href = anchor.href;
      if (!href.startsWith("http")) return;

      window.clearTimeout(hideTimer.current);
      window.clearTimeout(showTimer.current);
      const rect = anchor.getBoundingClientRect();
      showTimer.current = window.setTimeout(() => {
        setCard({
          url: href,
          left: Math.min(window.innerWidth - 320, Math.max(8, rect.left)),
          top: Math.min(window.innerHeight - 160, rect.bottom + 8),
          preview: null,
          error: null,
          loading: true,
        });
        void fetchLinkPreview(href)
          .then((preview) => {
            setCard((current) =>
              current && current.url === href
                ? { ...current, preview, loading: false }
                : current
            );
          })
          .catch((err: unknown) => {
            setCard((current) =>
              current && current.url === href
                ? {
                    ...current,
                    loading: false,
                    error:
                      err instanceof Error ? err.message : "Preview failed",
                  }
                : current
            );
          });
      }, 350);
    }

    function onOut(event: MouseEvent) {
      const related = event.relatedTarget;
      // Keep open only when moving onto the preview card itself.
      if (related instanceof Node && cardRef.current?.contains(related)) {
        return;
      }
      // Moving to another http link — onOver will cancel hide and retarget.
      const nextLink =
        related instanceof Element
          ? (related.closest("a[href]") as HTMLAnchorElement | null)
          : null;
      if (
        nextLink &&
        root.contains(nextLink) &&
        nextLink.href.startsWith("http")
      ) {
        return;
      }
      scheduleHide();
    }

    root.addEventListener("mouseover", onOver);
    root.addEventListener("mouseout", onOut);
    return () => {
      root.removeEventListener("mouseover", onOver);
      root.removeEventListener("mouseout", onOut);
      window.clearTimeout(hideTimer.current);
      window.clearTimeout(showTimer.current);
    };
  }, [editor, scheduleHide]);

  if (!card) return null;

  const title = card.preview?.title || card.url;

  return (
    <div
      ref={cardRef}
      className="link-hover-card"
      style={{ left: card.left, top: card.top }}
      onMouseEnter={cancelHide}
      onMouseLeave={scheduleHide}
    >
      {card.loading && <p className="link-hover-meta">Loading preview…</p>}
      {card.error && <p className="link-hover-error">{card.error}</p>}
      {card.preview && (
        <>
          {card.preview.siteName && (
            <p className="link-hover-site">{card.preview.siteName}</p>
          )}
          <p className="link-hover-title">{card.preview.title}</p>
          {card.preview.description && (
            <p className="link-hover-desc">{card.preview.description}</p>
          )}
        </>
      )}
      {!card.loading && !card.preview && !card.error && (
        <p className="link-hover-title">{card.url}</p>
      )}
      <div className="link-hover-actions">
        <a href={card.url} target="_blank" rel="noreferrer">
          Open
        </a>
        <button
          type="button"
          onClick={() => {
            openLinkPin({
              url: card.url,
              title,
              description: card.preview?.description,
              siteName: card.preview?.siteName,
              image: card.preview?.image,
            });
            hide();
          }}
        >
          Pin
        </button>
      </div>
    </div>
  );
}
