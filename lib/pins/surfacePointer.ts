/** Pixels of movement before a titlebar pointerdown becomes a drag. */
export const SURFACE_DRAG_THRESHOLD_PX = 4;

export type Point = { x: number; y: number };

export function pointerDistance(from: Point, to: Point): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  return Math.hypot(dx, dy);
}

/**
 * Titlebar clicks should not immediately enter a drag. Wait until the pointer
 * has moved far enough that the gesture is clearly a move, not a click.
 */
export function shouldStartPointerDrag(
  origin: Point,
  current: Point,
  thresholdPx: number = SURFACE_DRAG_THRESHOLD_PX
): boolean {
  return pointerDistance(origin, current) >= thresholdPx;
}
