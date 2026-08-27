/**
 * Link bubble placement: prefer below the anchor; flip above only when
 * needed; full-width sheet on narrow viewports.
 *
 * `top` is the visual top of the card (not a translateY bottom-edge). Callers
 * should remeasure with the real card size after paint. Pass `preferAbove` to
 * keep the original side when a late OG preview only changes height slightly.
 */

export const MOBILE_LINK_BREAKPOINT_PX = 767;
/** Matches `.link-edit-card` width: min(22rem, 100vw - 16px) at 16px root. */
export const LINK_BUBBLE_WIDTH_PX = 352;
export const LINK_BUBBLE_HEIGHT_COMPACT_PX = 148;
/** Compact thumbnail + labels + one-line summary; not a full-bleed image. */
export const LINK_BUBBLE_HEIGHT_PREVIEW_PX = 236;

export function isMobileViewport(
  width = typeof window !== "undefined" ? window.innerWidth : 1024
): boolean {
  return width <= MOBILE_LINK_BREAKPOINT_PX;
}

export type LinkBubblePlacement = {
  left: number;
  top: number;
  placeAbove: boolean;
  mobileSheet: boolean;
};

export function placeLinkBubble(
  rect: DOMRect,
  estimatedHeight: number,
  viewport: { width: number; height: number } = {
    width: typeof window !== "undefined" ? window.innerWidth : 1024,
    height: typeof window !== "undefined" ? window.innerHeight : 768,
  },
  estimatedWidth = LINK_BUBBLE_WIDTH_PX,
  options?: { preferAbove?: boolean }
): LinkBubblePlacement {
  if (isMobileViewport(viewport.width)) {
    return {
      left: 0,
      top: 0,
      placeAbove: false,
      mobileSheet: true,
    };
  }
  const margin = 8;
  const gap = 6;
  const width = Math.max(1, estimatedWidth);
  const height = Math.max(1, estimatedHeight);
  const left = Math.max(
    margin,
    Math.min(rect.left, viewport.width - width - margin)
  );
  const spaceBelow = viewport.height - (rect.bottom + gap) - margin;
  const spaceAbove = rect.top - gap - margin;
  const fitsBelow = spaceBelow >= height;
  const fitsAbove = spaceAbove >= height;
  const placeAbove =
    typeof options?.preferAbove === "boolean"
      ? options.preferAbove
      : !fitsBelow && (fitsAbove || spaceAbove > spaceBelow);
  let top = placeAbove ? rect.top - gap - height : rect.bottom + gap;
  const maxTop = Math.max(margin, viewport.height - height - margin);
  top = Math.min(Math.max(margin, top), maxTop);
  return { left, top, placeAbove, mobileSheet: false };
}
