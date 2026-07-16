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
  /** Closest anchor to the viewport focus line. */
  primary: boolean;
};

const GAP = 8;

/**
 * Pack sidenotes into the visible gutter so they stay on-screen, collide
 * without overlap, and mark the note nearest `focusY` as primary.
 */
export function packStickySidenotes(
  items: SidenoteLayoutInput[],
  viewportTop: number,
  viewportBottom: number,
  focusY: number
): SidenoteLayoutResult[] {
  if (items.length === 0) return [];

  const sorted = [...items].sort((a, b) => a.naturalTop - b.naturalTop);
  let primaryId = sorted[0].id;
  let bestDist = Infinity;
  for (const item of sorted) {
    const dist = Math.abs(item.naturalTop - focusY);
    if (dist < bestDist) {
      bestDist = dist;
      primaryId = item.id;
    }
  }

  // Forward pass: push down to avoid overlap, prefer natural tops.
  const tops: number[] = [];
  let cursor = viewportTop + GAP;
  for (const item of sorted) {
    const ideal = Math.max(viewportTop + GAP, item.naturalTop);
    const top = Math.max(cursor, ideal);
    tops.push(top);
    cursor = top + item.height + GAP;
  }

  // Backward pass: pull up if the stack overflows the viewport bottom.
  let bottomLimit = viewportBottom - GAP;
  for (let i = sorted.length - 1; i >= 0; i -= 1) {
    const height = sorted[i].height;
    const maxTop = bottomLimit - height;
    if (tops[i] > maxTop) tops[i] = Math.max(viewportTop + GAP, maxTop);
    bottomLimit = tops[i] - GAP;
  }

  // Forward again after the pull so gaps stay non-negative.
  cursor = viewportTop + GAP;
  for (let i = 0; i < sorted.length; i += 1) {
    tops[i] = Math.max(cursor, tops[i]);
    cursor = tops[i] + sorted[i].height + GAP;
  }

  return sorted.map((item, index) => ({
    id: item.id,
    top: tops[index],
    primary: item.id === primaryId,
  }));
}
