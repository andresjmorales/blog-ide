import { describe, expect, it } from "vitest";
import {
  SURFACE_DRAG_THRESHOLD_PX,
  pointerDistance,
  shouldStartPointerDrag,
} from "@/lib/pins/surfacePointer";

describe("surface pointer drag threshold", () => {
  it("does not start a drag on a stationary click", () => {
    expect(
      shouldStartPointerDrag({ x: 40, y: 80 }, { x: 40, y: 80 })
    ).toBe(false);
  });

  it("does not start a drag for sub-threshold jitter", () => {
    expect(
      shouldStartPointerDrag({ x: 40, y: 80 }, { x: 42, y: 81 })
    ).toBe(false);
    expect(pointerDistance({ x: 40, y: 80 }, { x: 42, y: 81 })).toBeLessThan(
      SURFACE_DRAG_THRESHOLD_PX
    );
  });

  it("starts a drag once movement reaches the threshold", () => {
    expect(
      shouldStartPointerDrag({ x: 40, y: 80 }, { x: 40, y: 84 })
    ).toBe(true);
    expect(
      shouldStartPointerDrag({ x: 10, y: 10 }, { x: 14, y: 13 })
    ).toBe(true);
  });
});
