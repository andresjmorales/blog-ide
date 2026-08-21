import type { Node as PMNode } from "@tiptap/pm/model";
import {
  bibleSearchQuery,
  detectEnglishBibleRefs,
} from "@/lib/bible/detect";

const SKIP_BLOCKS = new Set(["codeBlock", "footnoteRef"]);

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

function visitNode(
  hits: BibleRefHit[],
  node: PMNode,
  pos: number
): boolean | void {
  if (SKIP_BLOCKS.has(node.type.name)) return false;
  if (!node.isText || !node.text || skipTextNode(node)) return;
  pushHitsFromText(hits, node.text, pos);
}

/** Find Bible references in a ProseMirror doc without mutating it. */
export function collectBibleRefHits(doc: PMNode): BibleRefHit[] {
  const hits: BibleRefHit[] = [];
  doc.descendants((node, pos) => visitNode(hits, node, pos));
  return hits;
}

/**
 * Rescan only text nodes that overlap `[from, to)`. Used so typing one letter
 * does not re-detect the rest of the essay.
 */
export function collectBibleRefHitsInRange(
  doc: PMNode,
  from: number,
  to: number
): BibleRefHit[] {
  const hits: BibleRefHit[] = [];
  const start = Math.max(0, from);
  const end = Math.max(start, Math.min(doc.content.size, to));
  doc.nodesBetween(start, end, (node, pos) => visitNode(hits, node, pos));
  return hits;
}

/** Expand a change to the text nodes it sits in so a ref is never half-scanned. */
export function bibleScanBounds(
  doc: PMNode,
  from: number,
  to: number
): { from: number; to: number } {
  let lo = from;
  let hi = to;
  const start = Math.max(0, from);
  const end = Math.max(start, Math.min(doc.content.size, to));
  doc.nodesBetween(start, end, (node, pos) => {
    if (SKIP_BLOCKS.has(node.type.name)) return false;
    if (node.isText) {
      lo = Math.min(lo, pos);
      hi = Math.max(hi, pos + node.nodeSize);
    }
    return;
  });
  return { from: lo, to: hi };
}
