/**
 * Proximity / collision packing for sticky sidenotes.
 * Positions are in viewport (client) coordinates for `position: fixed` notes.
 */

export type SidenoteLayoutInput = {
  id: string;
  /** Ideal top (clientY) from the footnote anchor. */
  naturalTop: number;
  height: number;
};

export type SidenoteLayoutResult = {
  id: string;
  top: number;
  /** Height after fitting / truncation (may be less than input height). */
  height: number;
  /** Closest anchor to the viewport focus line. */
  primary: boolean;
  /** True when height was reduced to fit the gutter. */
  truncated: boolean;
};

const GAP = 8;
/** One-line-ish floor so crowded notes still show a label + snippet. */
export const SIDENOTE_MIN_HEIGHT = 36;

/**
 * Pack sidenotes into the visible gutter with sticky pinning, while still
 * tracking document scroll:
 *
 * - Notes whose anchors have scrolled a bit above stay sticky (wide band).
 * - When the stack is taller than the gutter, shrink notes (caller shows
 *   ellipsis) before dropping anyone.
 * - If still over capacity at minimum height, drop the oldest (top) notes so
 *   footnote #1 can leave — instead of pinning the whole list forever.
 * - After tops are set, each note expands into the space before the next
 *   (or the gutter bottom) up to its natural height — so the last note can
 *   fully open when there is room.
 */
export function packStickySidenotes(
  items: SidenoteLayoutInput[],
  viewportTop: number,
  viewportBottom: number,
  focusY: number
): SidenoteLayoutResult[] {
  if (items.length === 0) return [];

  const viewH = Math.max(1, viewportBottom - viewportTop);
  const gutterTop = viewportTop + GAP;
  const gutterBottom = viewportBottom - GAP;
  const gutterH = Math.max(SIDENOTE_MIN_HEIGHT, gutterBottom - gutterTop);

  const bandTop = viewportTop - viewH * 0.9;
  const bandBottom = viewportBottom + viewH * 0.35;

  let candidates = items.filter(
    (item) => item.naturalTop >= bandTop && item.naturalTop <= bandBottom
  );

  if (candidates.length === 0) {
    const above = items
      .filter((item) => item.naturalTop < focusY)
      .sort((a, b) => b.naturalTop - a.naturalTop);
    const below = items
      .filter((item) => item.naturalTop >= focusY)
      .sort((a, b) => a.naturalTop - b.naturalTop);
    candidates = [...above.slice(0, 5), ...below.slice(0, 5)];
  }

  let sorted = [...candidates].sort((a, b) => a.naturalTop - b.naturalTop);

  const maxAtMin = Math.max(
    1,
    Math.floor((gutterH + GAP) / (SIDENOTE_MIN_HEIGHT + GAP))
  );
  if (sorted.length > maxAtMin) {
    let bestStart = 0;
    let bestDist = Infinity;
    for (let start = 0; start <= sorted.length - maxAtMin; start += 1) {
      const slice = sorted.slice(start, start + maxAtMin);
      const mid = slice[Math.floor(slice.length / 2)];
      const dist = Math.abs(mid.naturalTop - focusY);
      if (dist < bestDist) {
        bestDist = dist;
        bestStart = start;
      }
    }
    sorted = sorted.slice(bestStart, bestStart + maxAtMin);
  }

  let primaryIndex = 0;
  let bestDist = Infinity;
  for (let i = 0; i < sorted.length; i += 1) {
    const dist = Math.abs(sorted[i].naturalTop - focusY);
    if (dist < bestDist) {
      bestDist = dist;
      primaryIndex = i;
    }
  }
  const primaryId = sorted[primaryIndex].id;

  // Initial heights: fit the stack, preferring the primary note's natural size.
  const heights = fitHeights(
    sorted.map((item) => item.height),
    gutterH,
    primaryIndex
  );

  // Place from natural tops with collision resolution.
  const tops: number[] = [];
  let cursor = gutterTop;
  for (let i = 0; i < sorted.length; i += 1) {
    const ideal = Math.max(gutterTop, sorted[i].naturalTop);
    const top = Math.max(cursor, ideal);
    tops.push(top);
    cursor = top + heights[i] + GAP;
  }

  // If the stack spills past the gutter, shift up as a block (notes leave top).
  const last = sorted.length - 1;
  const stackBottom = tops[last] + heights[last];
  if (stackBottom > gutterBottom) {
    const shift = stackBottom - gutterBottom;
    for (let i = 0; i < tops.length; i += 1) {
      tops[i] -= shift;
    }
  }

  // Clamp any note that landed above the gutter back down without overlapping.
  if (tops[0] < gutterTop) {
    const pull = gutterTop - tops[0];
    for (let i = 0; i < tops.length; i += 1) {
      tops[i] += pull;
    }
  }

  // Hard collision pass: enforce non-overlap and keep bottoms in gutter.
  // Shrink height when needed rather than overlapping.
  cursor = gutterTop;
  for (let i = 0; i < sorted.length; i += 1) {
    tops[i] = Math.max(cursor, Math.min(tops[i], gutterBottom - SIDENOTE_MIN_HEIGHT));
    const maxH = Math.max(
      SIDENOTE_MIN_HEIGHT,
      gutterBottom - tops[i] - (sorted.length - 1 - i) * (SIDENOTE_MIN_HEIGHT + GAP)
    );
    if (heights[i] > maxH) heights[i] = maxH;
    cursor = tops[i] + heights[i] + GAP;
  }

  // Expand each note into free space below it (up to natural height) so the
  // last note can fully open when the gutter has room.
  for (let i = 0; i < sorted.length; i += 1) {
    const limit =
      i < sorted.length - 1 ? tops[i + 1] - GAP : gutterBottom;
    const available = Math.max(SIDENOTE_MIN_HEIGHT, limit - tops[i]);
    heights[i] = Math.min(sorted[i].height, available);
  }

  // Final safety: no overlaps, nothing past gutter bottom.
  for (let i = 0; i < sorted.length; i += 1) {
    const nextLimit =
      i < sorted.length - 1 ? tops[i + 1] - GAP : gutterBottom;
    if (tops[i] + heights[i] > nextLimit) {
      heights[i] = Math.max(SIDENOTE_MIN_HEIGHT, nextLimit - tops[i]);
    }
  }

  return sorted.map((item, index) => ({
    id: item.id,
    top: tops[index],
    height: heights[index],
    primary: item.id === primaryId,
    truncated: heights[index] < item.height - 0.5,
  }));
}

/**
 * Shrink heights toward the minimum so the stack fits `gutterH`.
 * Shrink non-primary notes first so the focused note stays readable.
 */
function fitHeights(
  natural: number[],
  gutterH: number,
  primaryIndex: number
): number[] {
  const n = natural.length;
  if (n === 0) return [];
  const gaps = GAP * Math.max(0, n - 1);
  const budget = Math.max(n * SIDENOTE_MIN_HEIGHT, gutterH - gaps);
  const heights = natural.map((h) =>
    Math.max(SIDENOTE_MIN_HEIGHT, Math.min(h, budget))
  );

  let total = heights.reduce((sum, h) => sum + h, 0);
  if (total <= budget) return heights;

  let excess = total - budget;

  const shrinkOrder = [
    ...heights.map((_, i) => i).filter((i) => i !== primaryIndex),
    primaryIndex,
  ];

  for (const i of shrinkOrder) {
    if (excess <= 0.5) break;
    const room = heights[i] - SIDENOTE_MIN_HEIGHT;
    if (room <= 0) continue;
    const cut = Math.min(room, excess);
    heights[i] -= cut;
    excess -= cut;
  }

  return heights.map((h) => Math.max(SIDENOTE_MIN_HEIGHT, h));
}
