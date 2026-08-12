/**
 * Link bubble placement: prefer below the anchor; flip above only when
 * needed; full-width sheet on narrow viewports.
 */

export const MOBILE_LINK_BREAKPOINT_PX = 767;

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
  }
): LinkBubblePlacement {
  if (isMobileViewport(viewport.width)) {
    return {
      left: 0,
      top: 0,
      placeAbove: false,
      mobileSheet: true,
    };
  }
  const left = Math.min(viewport.width - 320, Math.max(8, rect.left));
  const spaceBelow = viewport.height - rect.bottom - 8;
  const placeAbove =
    spaceBelow < estimatedHeight && rect.top > estimatedHeight + 8;
  const top = placeAbove
    ? Math.max(8, rect.top - 6)
    : Math.min(viewport.height - 8, rect.bottom + 6);
  return { left, top, placeAbove, mobileSheet: false };
}
