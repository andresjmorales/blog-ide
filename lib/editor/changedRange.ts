import type { Node as PMNode } from "@tiptap/pm/model";
import type { Transaction } from "@tiptap/pm/state";

export type DocRange = { from: number; to: number };

const WORD_CHAR = /[\p{L}\p{N}'’]/u;

export function rangesOverlap(
  aFrom: number,
  aTo: number,
  bFrom: number,
  bTo: number
): boolean {
  return aFrom < bTo && aTo > bFrom;
}

export function isWordChar(ch: string): boolean {
  return ch.length > 0 && WORD_CHAR.test(ch);
}

/** Grow a range to the word (or words) it sits in, without leaving the textblock. */
export function expandToWord(doc: PMNode, from: number, to: number): DocRange {
  const size = doc.content.size;
  let left = Math.max(0, Math.min(from, size));
  let right = Math.max(left, Math.min(to, size));
  if (size === 0) return { from: 0, to: 0 };

  const $from = doc.resolve(left);
  const $to = doc.resolve(right);
  const start = $from.start();
  const end = $to.end();

  while (left > start) {
    const ch = doc.textBetween(left - 1, left);
    if (!isWordChar(ch)) break;
    left -= 1;
  }
  while (right < end) {
    const ch = doc.textBetween(right, right + 1);
    if (!isWordChar(ch)) break;
    right += 1;
  }
  return { from: left, to: right };
}

/**
 * Changed range in the post-transaction document, or null.
 * Subsequent step maps are composed so a multi-step tr still yields one span.
 */
export function changedRangeInNewDoc(tr: Transaction): DocRange | null {
  if (!tr.docChanged) return null;
  let from = tr.doc.content.size;
  let to = 0;
  let found = false;
  tr.mapping.maps.forEach((map, index) => {
    const suffix = tr.mapping.slice(index + 1);
    map.forEach((_oldStart, _oldEnd, newStart, newEnd) => {
      found = true;
      const mappedFrom = suffix.map(newStart, 1);
      const mappedTo = suffix.map(newEnd, -1);
      from = Math.min(from, mappedFrom);
      to = Math.max(to, mappedTo);
    });
  });
  if (!found) return null;
  if (from > to) return { from, to: from };
  return { from, to };
}

/** True when the change is entirely an atomic node (footnote, image, math, …). */
export function isAtomOnlyChange(
  doc: PMNode,
  from: number,
  to: number
): boolean {
  const node = doc.nodeAt(from);
  if (!node || !node.isAtom || node.isText) return false;
  return to <= from + node.nodeSize;
}
