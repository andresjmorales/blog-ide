import type { Node as PMNode } from "@tiptap/pm/model";
import {
  bibleSearchQuery,
  detectEnglishBibleRefs,
} from "@/lib/bible/detect";

const SKIP_BLOCKS = new Set(["codeBlock", "footnoteRef"]);

/**
 * Characters of prose rescanned on either side of a keystroke.
 * One English reference is well under this (`detect_references` caps the
 * book-name token). The window stays on the caret instead of the paragraph.
 */
export const BIBLE_SCAN_RADIUS = 160;

export type BibleRefHit = {
  id: string;
  from: number;
  to: number;
  text: string;
  label: string;
  search: string;
  serialized: string;
};

function skipTextNode(node: PMNode): boolean {
  return node.marks.some((mark) => mark.type.name === "code");
}

function pushHitsFromText(
  hits: BibleRefHit[],
  text: string,
  pos: number
): void {
  for (const match of detectEnglishBibleRefs(text)) {
    const from = pos + match.index;
    const to = from + match.text.length;
    if (to <= from) continue;
    const serialized = match.ref.to_serialized();
    hits.push({
      id: `${from}-${to}-${serialized}`,
      from,
      to,
      text: match.text,
      label: match.ref.toString(),
      search: bibleSearchQuery(match),
      serialized,
    });
  }
}

function textSlice(
  node: PMNode,
  pos: number,
  range?: { from: number; to: number }
): { text: string; pos: number } | null {
  if (!node.isText || !node.text || skipTextNode(node)) return null;
  if (!range) {
    if (!/\d/.test(node.text)) return null;
    return { text: node.text, pos };
  }
  const nodeEnd = pos + node.text.length;
  const from = Math.max(pos, range.from);
  const to = Math.min(nodeEnd, range.to);
  if (to <= from) return null;
  const text = node.text.slice(from - pos, to - pos);
  if (!/\d/.test(text)) return null;
  return { text, pos: from };
}

function visitNode(
  hits: BibleRefHit[],
  node: PMNode,
  pos: number,
  range?: { from: number; to: number }
): boolean | void {
  if (SKIP_BLOCKS.has(node.type.name)) return false;
  const slice = textSlice(node, pos, range);
  if (!slice) return;
  pushHitsFromText(hits, slice.text, slice.pos);
}

/** Find Bible references in a ProseMirror doc without mutating it. */
export function collectBibleRefHits(doc: PMNode): BibleRefHit[] {
  const hits: BibleRefHit[] = [];
  doc.descendants((node, pos) => visitNode(hits, node, pos));
  return hits;
}

/**
 * Rescan text that overlaps `[from, to)`. Each text node contributes only
 * that slice, not the rest of a long paragraph.
 */
export function collectBibleRefHitsInRange(
  doc: PMNode,
  from: number,
  to: number
): BibleRefHit[] {
  const hits: BibleRefHit[] = [];
  const start = Math.max(0, from);
  const end = Math.max(start, Math.min(doc.content.size, to));
  const range = { from: start, to: end };
  doc.nodesBetween(start, end, (node, pos) =>
    visitNode(hits, node, pos, range)
  );
  return hits;
}

/**
 * Window around a change for a hot-path rescan. Does not grow to the
 * surrounding text node: a long paragraph stays mapped outside this span.
 */
export function bibleScanBounds(
  doc: PMNode,
  from: number,
  to: number
): { from: number; to: number } {
  const size = doc.content.size;
  const originFrom = Math.max(0, Math.min(from, size));
  const originTo = Math.max(originFrom, Math.min(to, size));
  return {
    from: Math.max(0, originFrom - BIBLE_SCAN_RADIUS),
    to: Math.min(size, originTo + BIBLE_SCAN_RADIUS),
  };
}
