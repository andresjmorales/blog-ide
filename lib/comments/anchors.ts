import type { Node as PMNode } from "@tiptap/pm/model";

/**
 * Text-quote anchors for comment threads (W3C Web Annotation style).
 *
 * The owner keeps editing while threads are open, so an anchor is never a
 * ProseMirror position or a markdown offset. It is the quoted text plus a
 * little context, searched for again in the current text. Body threads
 * search the essay body; footnote threads search only that note's text.
 *
 * Pure: takes ProseMirror docs, never an editor, so it is shared by the
 * owner's editor, open footnote cards, and the invitee view.
 */

export type CommentAnchorScope = "body" | "footnote";

export type CommentAnchor = {
  scope: CommentAnchorScope;
  /** Stable footnote id (persisted in the markdown) when scope = footnote. */
  footnoteId?: string;
  quote: string;
  prefix: string;
  suffix: string;
  /** Plain-text offset at creation; tie-breaker between equal matches. */
  hint: number;
};

export type AnchorRange = { from: number; to: number };

/** Characters of context stored on each side of the quote. */
export const ANCHOR_CONTEXT_CHARS = 32;
/** Longest quote stored; longer selections are cut (the server caps 2000). */
export const ANCHOR_MAX_QUOTE = 1000;

type Segment = {
  /** Offset of this run in the projected text. */
  start: number;
  /** ProseMirror position of the run's first character. */
  pos: number;
  length: number;
};

export type TextProjection = {
  text: string;
  segments: Segment[];
};

const projections = new WeakMap<PMNode, TextProjection>();

/**
 * Plain text of a doc with a map back to positions. Textblocks are joined
 * by "\n"; hard breaks are "\n"; footnote atoms and other inline atoms add
 * nothing (a quote spanning a footnote marker reads as continuous text).
 * Cached per immutable doc.
 */
export function projectText(doc: PMNode): TextProjection {
  const hit = projections.get(doc);
  if (hit) return hit;
  let text = "";
  const segments: Segment[] = [];
  let sawBlock = false;
  doc.descendants((node, pos) => {
    if (node.isTextblock) {
      if (sawBlock) text += "\n";
      sawBlock = true;
      return true;
    }
    if (node.isText) {
      const value = node.text ?? "";
      if (value) {
        segments.push({ start: text.length, pos, length: value.length });
        text += value;
      }
      return false;
    }
    if (node.type.name === "hardBreak") {
      text += "\n";
      return false;
    }
    return !node.isAtom;
  });
  const projection = { text, segments };
  projections.set(doc, projection);
  return projection;
}

function segmentIndexForPos(segments: Segment[], pos: number): number {
  let lo = 0;
  let hi = segments.length - 1;
  let best = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (segments[mid].pos <= pos) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return best;
}

/** Text offset for a document position (snaps to the nearest text run). */
export function offsetAtPos(projection: TextProjection, pos: number): number {
  const { segments, text } = projection;
  if (segments.length === 0) return 0;
  const index = segmentIndexForPos(segments, pos);
  if (index < 0) return segments[0].start;
  const seg = segments[index];
  if (pos <= seg.pos + seg.length) return seg.start + (pos - seg.pos);
  // Between runs (a footnote atom, a block boundary): next run's start.
  const next = segments[index + 1];
  return next ? next.start : text.length;
}

function segmentIndexForOffset(segments: Segment[], offset: number): number {
  let lo = 0;
  let hi = segments.length - 1;
  let best = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (segments[mid].start <= offset) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return best;
}

/** Document range covering text offsets [start, end). */
export function rangeForOffsets(
  projection: TextProjection,
  start: number,
  end: number
): AnchorRange | null {
  const { segments } = projection;
  if (end <= start || segments.length === 0) return null;
  let fromIndex = segmentIndexForOffset(segments, start);
  if (fromIndex < 0) fromIndex = 0;
  let fromSeg = segments[fromIndex];
  // Start sits on a separator after this run: move to the next run.
  if (start >= fromSeg.start + fromSeg.length) {
    fromSeg = segments[fromIndex + 1];
    if (!fromSeg) return null;
  }
  const from = fromSeg.pos + Math.max(0, start - fromSeg.start);
  const lastIndex = segmentIndexForOffset(segments, end - 1);
  if (lastIndex < 0) return null;
  const lastSeg = segments[lastIndex];
  const to =
    lastSeg.pos + Math.min(lastSeg.length, end - lastSeg.start);
  return to > from ? { from, to } : null;
}

/**
 * Anchor for the selection [from, to) in `doc`. Null when the selection
 * holds no text (only whitespace or atoms).
 */
export function createAnchor(
  doc: PMNode,
  from: number,
  to: number,
  scope: CommentAnchorScope = "body",
  footnoteId?: string
): CommentAnchor | null {
  const projection = projectText(doc);
  let start = offsetAtPos(projection, Math.min(from, to));
  let end = offsetAtPos(projection, Math.max(from, to));
  const { text } = projection;
  // Trim surrounding whitespace so the highlight hugs the words.
  while (start < end && /\s/.test(text[start])) start += 1;
  while (end > start && /\s/.test(text[end - 1])) end -= 1;
  if (end <= start) return null;
  if (end - start > ANCHOR_MAX_QUOTE) end = start + ANCHOR_MAX_QUOTE;
  return {
    scope,
    ...(scope === "footnote" && footnoteId ? { footnoteId } : {}),
    quote: text.slice(start, end),
    prefix: text.slice(Math.max(0, start - ANCHOR_CONTEXT_CHARS), start),
    suffix: text.slice(end, end + ANCHOR_CONTEXT_CHARS),
    hint: start,
  };
}

function allIndexes(haystack: string, needle: string, limit = 2000): number[] {
  const out: number[] = [];
  if (!needle) return out;
  let at = haystack.indexOf(needle);
  while (at !== -1 && out.length < limit) {
    out.push(at);
    at = haystack.indexOf(needle, at + 1);
  }
  return out;
}

/** Shared trailing characters of `a` and `b`. */
function commonSuffixLength(a: string, b: string): number {
  let n = 0;
  while (n < a.length && n < b.length && a[a.length - 1 - n] === b[b.length - 1 - n]) {
    n += 1;
  }
  return n;
}

function commonPrefixLength(a: string, b: string): number {
  let n = 0;
  while (n < a.length && n < b.length && a[n] === b[n]) n += 1;
  return n;
}

export type OffsetMatch = {
  start: number;
  end: number;
  /** exact = quote found; fuzzy = context or quote ends found, text changed. */
  kind: "exact" | "fuzzy";
};

/** Pick the candidate with the best context match, then nearest `hint`. */
function bestExact(
  text: string,
  anchor: CommentAnchor,
  starts: number[]
): number {
  let best = starts[0];
  let bestScore = -1;
  let bestDistance = Infinity;
  for (const start of starts) {
    const end = start + anchor.quote.length;
    const before = text.slice(Math.max(0, start - anchor.prefix.length), start);
    const after = text.slice(end, end + anchor.suffix.length);
    const score =
      commonSuffixLength(before, anchor.prefix) +
      commonPrefixLength(after, anchor.suffix);
    const distance = Math.abs(start - anchor.hint);
    if (
      score > bestScore ||
      (score === bestScore && distance < bestDistance)
    ) {
      best = start;
      bestScore = score;
      bestDistance = distance;
    }
  }
  return best;
}

function nearest<T extends { start: number }>(items: T[], hint: number): T | null {
  let best: T | null = null;
  let distance = Infinity;
  for (const item of items) {
    const d = Math.abs(item.start - hint);
    if (d < distance) {
      best = item;
      distance = d;
    }
  }
  return best;
}

/** Minimum context/edge length worth searching for on its own. */
const MIN_FUZZY_PROBE = 6;

/**
 * Text offsets for `anchor` in `text`:
 * 1. exact quote, disambiguated by prefix/suffix, then nearest `hint`;
 * 2. fuzzy: the span between the stored prefix and suffix (the quote was
 *    edited in place), or between the quote's first and last words;
 * 3. null → detached (the quoted text is gone).
 */
export function resolveAnchorOffsets(
  text: string,
  anchor: CommentAnchor
): OffsetMatch | null {
  const quote = anchor.quote;
  if (!quote) return null;

  const exact = allIndexes(text, quote);
  if (exact.length > 0) {
    const start =
      exact.length === 1 ? exact[0] : bestExact(text, anchor, exact);
    return { start, end: start + quote.length, kind: "exact" };
  }

  const maxSpan = quote.length * 2 + 64;

  // Edited inside the quote: the surrounding context still brackets it.
  const prefix = anchor.prefix.slice(-16);
  const suffix = anchor.suffix.slice(0, 16);
  if (prefix.length >= MIN_FUZZY_PROBE && suffix.length >= MIN_FUZZY_PROBE) {
    const spans: { start: number; end: number }[] = [];
    for (const at of allIndexes(text, prefix, 200)) {
      const start = at + prefix.length;
      const end = text.indexOf(suffix, start);
      if (end === -1 || end - start > maxSpan) continue;
      if (end > start && text.slice(start, end).trim()) {
        spans.push({ start, end });
      }
    }
    const pick = nearest(spans, anchor.hint);
    if (pick) return { ...pick, kind: "fuzzy" };
  }

  // Context changed too; the quote's opening and closing words survive.
  if (quote.length >= MIN_FUZZY_PROBE * 2) {
    const edge = Math.max(
      MIN_FUZZY_PROBE,
      Math.min(16, Math.floor(quote.length / 4))
    );
    const head = quote.slice(0, edge);
    const tail = quote.slice(-edge);
    const spans: { start: number; end: number }[] = [];
    for (const start of allIndexes(text, head, 200)) {
      const tailAt = text.indexOf(tail, start + head.length);
      if (tailAt === -1) continue;
      const end = tailAt + tail.length;
      if (end - start > maxSpan) continue;
      spans.push({ start, end });
    }
    const pick = nearest(spans, anchor.hint);
    if (pick) return { ...pick, kind: "fuzzy" };
  }

  return null;
}

export type ResolvedAnchor = AnchorRange & { kind: "exact" | "fuzzy" };

/** Document range for `anchor` in `doc`, or null when detached. */
export function resolveAnchor(
  doc: PMNode,
  anchor: CommentAnchor
): ResolvedAnchor | null {
  const projection = projectText(doc);
  const match = resolveAnchorOffsets(projection.text, anchor);
  if (!match) return null;
  const range = rangeForOffsets(projection, match.start, match.end);
  return range ? { ...range, kind: match.kind } : null;
}

/** Runtime check for anchors read back from the server. */
export function isCommentAnchor(value: unknown): value is CommentAnchor {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    (v.scope === "body" || v.scope === "footnote") &&
    typeof v.quote === "string" &&
    v.quote.length > 0 &&
    (v.scope === "body" || typeof v.footnoteId === "string") &&
    typeof (v.prefix ?? "") === "string" &&
    typeof (v.suffix ?? "") === "string" &&
    typeof (v.hint ?? 0) === "number"
  );
}

/** Normalize a server anchor (missing optional fields become defaults). */
export function normalizeAnchor(value: CommentAnchor): CommentAnchor {
  return {
    scope: value.scope,
    ...(value.scope === "footnote" ? { footnoteId: value.footnoteId } : {}),
    quote: value.quote,
    prefix: value.prefix ?? "",
    suffix: value.suffix ?? "",
    hint: typeof value.hint === "number" ? value.hint : 0,
  };
}
