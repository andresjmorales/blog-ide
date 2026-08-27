import { describe, expect, it } from "vitest";
import {
  isMobileViewport,
  LINK_BUBBLE_WIDTH_PX,
  MOBILE_LINK_BREAKPOINT_PX,
  placeLinkBubble,
} from "@/lib/editor/linkPlacement";

describe("placeLinkBubble", () => {
  it("prefers below the anchor when there is room", () => {
    const rect = new DOMRect(40, 80, 120, 18);
    const placed = placeLinkBubble(rect, 120, { width: 1024, height: 768 });
    expect(placed.mobileSheet).toBe(false);
    expect(placed.placeAbove).toBe(false);
    expect(placed.top).toBeGreaterThan(rect.bottom);
    expect(placed.left).toBeGreaterThanOrEqual(8);
  });

  it("flips above only when needed and keeps the card on screen", () => {
    const rect = new DOMRect(40, 700, 120, 18);
    const placed = placeLinkBubble(rect, 200, { width: 1024, height: 768 });
    expect(placed.placeAbove).toBe(true);
    expect(placed.top).toBeLessThanOrEqual(rect.top);
    expect(placed.top).toBeGreaterThanOrEqual(8);
    expect(placed.top + 200).toBeLessThanOrEqual(rect.top);
  });

  it("stays below when a compact preview fits even if a taller estimate would flip", () => {
    const rect = new DOMRect(40, 520, 120, 18);
    const viewport = { width: 1024, height: 768 };
    expect(placeLinkBubble(rect, 290, viewport).placeAbove).toBe(true);
    expect(placeLinkBubble(rect, 200, viewport).placeAbove).toBe(false);
  });

  it("clamps left so the card does not overflow the right edge", () => {
    const rect = new DOMRect(900, 80, 80, 16);
    const placed = placeLinkBubble(rect, 120, { width: 1024, height: 768 });
    expect(placed.left + LINK_BUBBLE_WIDTH_PX).toBeLessThanOrEqual(1024 - 8);
  });

  it("uses a full-width sheet at or below 767px", () => {
    expect(isMobileViewport(MOBILE_LINK_BREAKPOINT_PX)).toBe(true);
    expect(isMobileViewport(768)).toBe(false);
    const rect = new DOMRect(20, 40, 80, 16);
    const placed = placeLinkBubble(rect, 120, { width: 767, height: 640 });
    expect(placed.mobileSheet).toBe(true);
    expect(placed.placeAbove).toBe(false);
    expect(placed.left).toBe(0);
  });
});
