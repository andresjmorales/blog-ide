import { describe, expect, it } from "vitest";
import {
  isMobileViewport,
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

  it("flips above only when needed", () => {
    const rect = new DOMRect(40, 700, 120, 18);
    const placed = placeLinkBubble(rect, 200, { width: 1024, height: 768 });
    expect(placed.placeAbove).toBe(true);
    expect(placed.top).toBeLessThanOrEqual(rect.top);
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
