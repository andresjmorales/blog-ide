"use client";

import { useEffect } from "react";
import { packStickySidenotes } from "@/lib/editor/sidenoteLayout";

/**
 * When sticky sidenotes are enabled, reposition each `.footnote-sidenote`
 * with `position: fixed` so notes pack into the visible gutter without
 * overlapping. Floating footnote editor cards are untouched.
 */
export function useStickySidenotes(
  scrollRoot: HTMLElement | null,
  enabled: boolean
) {
  useEffect(() => {
    if (!enabled || !scrollRoot) return;

    let frame = 0;

    function layout() {
      frame = 0;
      if (!scrollRoot) return;

      const nodes = [
        ...scrollRoot.querySelectorAll<HTMLElement>(".footnote-node"),
      ];
      if (nodes.length === 0) return;

      const scrollRect = scrollRoot.getBoundingClientRect();
      const focusY = scrollRect.top + scrollRect.height * 0.35;
      const prose =
        scrollRoot.querySelector<HTMLElement>(".editor-prose") ?? scrollRoot;
      const proseRect = prose.getBoundingClientRect();
      const right = Math.max(12, window.innerWidth - proseRect.right - 16);
      const width = Math.min(232, Math.max(160, right - 8));

      const measured = nodes.flatMap((node) => {
        const id = node.getAttribute("data-footnote-id");
        const sidenote = node.querySelector<HTMLElement>(".footnote-sidenote");
        const anchor =
          node.querySelector<HTMLElement>(".footnote-ref") ?? node;
        if (!id || !sidenote) return [];

        // Measure natural height while temporarily unfixed.
        sidenote.classList.remove("is-sticky-placed");
        sidenote.style.top = "";
        sidenote.style.right = "";
        sidenote.style.width = `${width}px`;
        const height = Math.max(sidenote.offsetHeight, 28);
        const naturalTop = anchor.getBoundingClientRect().top;

        return [{ id, naturalTop, height, sidenote }];
      });

      const packed = packStickySidenotes(
        measured.map(({ id, naturalTop, height }) => ({
          id,
          naturalTop,
          height,
        })),
        scrollRect.top + 8,
        scrollRect.bottom - 8,
        focusY
      );

      const byId = new Map(packed.map((item) => [item.id, item]));
      for (const item of measured) {
        const place = byId.get(item.id);
        if (!place) continue;
        item.sidenote.classList.add("is-sticky-placed");
        item.sidenote.classList.toggle("is-primary", place.primary);
        item.sidenote.style.top = `${place.top}px`;
        item.sidenote.style.right = `${right - width}px`;
        item.sidenote.style.width = `${width}px`;
      }
    }

    function schedule() {
      if (frame) return;
      frame = window.requestAnimationFrame(layout);
    }

    schedule();
    scrollRoot.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    const observer = new MutationObserver(schedule);
    observer.observe(scrollRoot, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      scrollRoot.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      observer.disconnect();
      scrollRoot
        .querySelectorAll<HTMLElement>(".footnote-sidenote")
        .forEach((sidenote) => {
          sidenote.classList.remove("is-sticky-placed", "is-primary");
          sidenote.style.top = "";
          sidenote.style.right = "";
          sidenote.style.width = "";
        });
    };
  }, [enabled, scrollRoot]);
}
