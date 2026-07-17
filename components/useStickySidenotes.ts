"use client";

import { useEffect } from "react";
import { packStickySidenotes } from "@/lib/editor/sidenoteLayout";

/** Soft cap before packing; packing may expand up to this when space allows. */
const MAX_NOTE_HEIGHT = 320;

/**
 * When sticky sidenotes are enabled, reposition each `.footnote-sidenote`
 * with `position: fixed` so notes pack into the visible gutter without
 * overlapping. Crowded notes truncate with an ellipsis; only when even
 * minimum-height rows won't fit do older notes leave the gutter.
 */
export function useStickySidenotes(
  scrollRoot: HTMLElement | null,
  enabled: boolean
) {
  useEffect(() => {
    if (!enabled || !scrollRoot) return;

    let frame = 0;
    let applying = false;

    function layout() {
      if (!scrollRoot) return;

      const nodes = [
        ...scrollRoot.querySelectorAll<HTMLElement>(".footnote-node"),
      ];
      if (nodes.length === 0) return;

      const scrollRect = scrollRoot.getBoundingClientRect();
      const focusY = scrollRect.top + scrollRect.height * 0.4;
      const prose =
        scrollRoot.querySelector<HTMLElement>(".editor-prose") ?? scrollRoot;
      const proseRect = prose.getBoundingClientRect();
      const right = Math.max(12, window.innerWidth - proseRect.right - 16);
      const width = Math.min(232, Math.max(160, right - 8));
      const gutterTop = scrollRect.top + 8;
      const gutterBottom = scrollRect.bottom - 8;

      const measured = nodes.flatMap((node) => {
        const id = node.getAttribute("data-footnote-id");
        const sidenote = node.querySelector<HTMLElement>(".footnote-sidenote");
        const anchor =
          node.querySelector<HTMLElement>(".footnote-ref") ?? node;
        if (!id || !sidenote) return [];

        sidenote.classList.remove(
          "is-sticky-placed",
          "is-primary",
          "is-sticky-hidden",
          "is-truncated"
        );
        sidenote.classList.add("is-measuring");
        sidenote.style.top = "";
        sidenote.style.right = "";
        sidenote.style.width = `${width}px`;
        sidenote.style.maxHeight = "";
        sidenote.style.height = "";

        const naturalHeight = Math.max(sidenote.scrollHeight, 28);
        const height = Math.min(naturalHeight, MAX_NOTE_HEIGHT);
        const naturalTop = anchor.getBoundingClientRect().top;
        sidenote.classList.remove("is-measuring");

        return [{ id, naturalTop, height, naturalHeight, sidenote }];
      });

      const packed = packStickySidenotes(
        measured.map(({ id, naturalTop, height }) => ({
          id,
          naturalTop,
          height,
        })),
        gutterTop,
        gutterBottom,
        focusY
      );

      const byId = new Map(packed.map((item) => [item.id, item]));

      for (const item of measured) {
        const place = byId.get(item.id);
        if (!place) {
          item.sidenote.classList.add("is-sticky-hidden");
          continue;
        }
        item.sidenote.classList.add("is-sticky-placed");
        item.sidenote.classList.toggle("is-primary", place.primary);
        item.sidenote.classList.toggle("is-truncated", place.truncated);
        item.sidenote.style.top = `${place.top}px`;
        item.sidenote.style.right = `${right - width}px`;
        item.sidenote.style.width = `${width}px`;
        item.sidenote.style.maxHeight = `${place.height}px`;
      }
    }

    function schedule() {
      if (applying || frame) return;
      frame = window.requestAnimationFrame(() => {
        applying = true;
        try {
          layout();
        } finally {
          applying = false;
          frame = 0;
        }
      });
    }

    schedule();
    scrollRoot.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    const observer = new MutationObserver(schedule);
    observer.observe(scrollRoot, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: false,
    });

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      scrollRoot.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      observer.disconnect();
      scrollRoot
        .querySelectorAll<HTMLElement>(".footnote-sidenote")
        .forEach((sidenote) => {
          sidenote.classList.remove(
            "is-sticky-placed",
            "is-primary",
            "is-sticky-hidden",
            "is-truncated",
            "is-measuring"
          );
          sidenote.style.top = "";
          sidenote.style.right = "";
          sidenote.style.width = "";
          sidenote.style.maxHeight = "";
          sidenote.style.height = "";
        });
    };
  }, [enabled, scrollRoot]);
}
