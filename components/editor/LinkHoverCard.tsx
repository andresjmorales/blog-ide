"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Editor } from "@tiptap/core";
import { fetchLinkPreview } from "@/lib/preview/client";
import type { LinkPreview } from "@/lib/preview/openGraph";
import { openLinkPin } from "@/lib/pins/pinStore";
import { LinkPreviewSnippet } from "@/components/editor/LinkPreviewSnippet";
import {
  LINK_BUBBLE_HEIGHT_PREVIEW_PX,
  placeLinkBubble,
} from "@/lib/editor/linkPlacement";

type CardState = {
  url: string;
  left: number;
  top: number;
  placeAbove: boolean;
  preview: LinkPreview | null;
  error: string | null;
  loading: boolean;
};

/**
 * Hovering a link in the editor (or sidenote rail) shows an OG preview with Pin and read here / Open.
 */
export function LinkHoverCard({
  editor,
  roots: extraRoots = [],
}: {
  editor: Editor | null;
  /** Extra DOM roots (e.g. sidenote rail) that also contain http links. */
  roots?: Array<HTMLElement | null | undefined>;
}) {
  const [card, setCard] = useState<CardState | null>(null);
  const hideTimer = useRef(0);
  const showTimer = useRef(0);
  const cardRef = useRef<HTMLDivElement | null>(null);

  const rootsKey = useMemo(
    () => extraRoots.map((el) => (el ? "1" : "0")).join(""),
    [extraRoots]
  );

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
    const roots = [
      editor?.view.dom ?? null,
      ...extraRoots,
    ].filter((el): el is HTMLElement => Boolean(el));
    if (roots.length === 0) return;

    function inRoots(node: Node | null): boolean {
      return Boolean(node && roots.some((root) => root.contains(node)));
    }

    function onOver(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest("a[href]") as HTMLAnchorElement | null;
      if (!anchor || !inRoots(anchor)) return;
      const href = anchor.href;
      if (!href.startsWith("http")) return;

      window.clearTimeout(hideTimer.current);
      window.clearTimeout(showTimer.current);
      const rect = anchor.getBoundingClientRect();
      showTimer.current = window.setTimeout(() => {
        const pos = placeLinkBubble(rect, LINK_BUBBLE_HEIGHT_PREVIEW_PX);
        setCard({
          url: href,
          left: pos.left,
          top: pos.top,
          placeAbove: pos.placeAbove,
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
        inRoots(nextLink) &&
        nextLink.href.startsWith("http")
      ) {
        return;
      }
      scheduleHide();
    }

    for (const root of roots) {
      root.addEventListener("mouseover", onOver);
      root.addEventListener("mouseout", onOut);
    }
    return () => {
      for (const root of roots) {
        root.removeEventListener("mouseover", onOver);
        root.removeEventListener("mouseout", onOut);
      }
      window.clearTimeout(hideTimer.current);
      window.clearTimeout(showTimer.current);
    };
    // rootsKey tracks mount/unmount of extra roots without depending on array identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, rootsKey, scheduleHide]);

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
      <LinkPreviewSnippet
        url={card.url}
        preview={card.preview}
        loading={card.loading}
        error={card.error}
        onPinAndRead={() => {
          openLinkPin({
            url: card.url,
            title,
            description: card.preview?.description,
            siteName: card.preview?.siteName,
            image: card.preview?.image,
            autoExtract: true,
          });
          hide();
        }}
      />
    </div>
  );
}
