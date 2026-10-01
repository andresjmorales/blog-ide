/**
 * Anchor-aligned scroll mapping between the essay and the footnote rail.
 *
 * Each footnote gives one anchor: the essay scrollTop at which its marker
 * sits on the focus line, paired with the rail scrollTop at which its note
 * sits on that same line. Between anchors we interpolate linearly, and the
 * ends are pinned (top ↔ top, bottom ↔ bottom), so the note for whatever
 * marker is crossing the focus line lines up beside it. Dense stretches
 * make the rail move faster, and long notes make it move slower.
 */

export type ScrollAnchor = { essay: number; rail: number };

export type ScrollMap = {
  /** Strictly increasing in both coordinates, from (0, 0) to the maxes. */
  points: ScrollAnchor[];
};

/**
 * Keep the anchors that fit strictly inside both scroll ranges and strictly
 * increase in both coordinates (in document order), then pin the ends.
 * Anchors out of range (markers near the top/bottom, notes the rail can't
 * scroll to) drop out and the ends take over smoothly.
 */
export function buildScrollMap(
  anchors: ScrollAnchor[],
  maxEssay: number,
  maxRail: number
): ScrollMap {
  const essayMax = Math.max(0, maxEssay);
  const railMax = Math.max(0, maxRail);
  const points: ScrollAnchor[] = [{ essay: 0, rail: 0 }];
  // Need a little room between anchors so slopes stay sane.
  const MIN_GAP = 1;
  for (const anchor of anchors) {
    if (!Number.isFinite(anchor.essay) || !Number.isFinite(anchor.rail)) {
      continue;
    }
    const prev = points[points.length - 1];
    if (anchor.essay < prev.essay + MIN_GAP) continue;
    if (anchor.rail < prev.rail + MIN_GAP) continue;
    if (anchor.essay > essayMax - MIN_GAP) continue;
    if (anchor.rail > railMax - MIN_GAP) continue;
    points.push({ essay: anchor.essay, rail: anchor.rail });
  }
  points.push({ essay: essayMax, rail: railMax });
  return { points };
}

function interpolate(
  points: ScrollAnchor[],
  value: number,
  from: keyof ScrollAnchor,
  to: keyof ScrollAnchor
): number {
  const first = points[0];
  const last = points[points.length - 1];
  if (value <= first[from]) return first[to];
  if (value >= last[from]) return last[to];
  // Binary search for the segment containing value.
  let lo = 0;
  let hi = points.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (points[mid][from] <= value) lo = mid;
    else hi = mid;
  }
  const a = points[lo];
  const b = points[hi];
  const span = b[from] - a[from];
  if (span <= 0) return a[to];
  return a[to] + ((value - a[from]) / span) * (b[to] - a[to]);
}

/** Rail scrollTop for an essay scrollTop. */
export function railForEssay(map: ScrollMap, essayTop: number): number {
  return interpolate(map.points, essayTop, "essay", "rail");
}

/** Essay scrollTop for a rail scrollTop (inverse of railForEssay). */
export function essayForRail(map: ScrollMap, railTop: number): number {
  return interpolate(map.points, railTop, "rail", "essay");
}
