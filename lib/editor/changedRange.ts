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

function rangeContainsNodeType(
  doc: PMNode,
  from: number,
  to: number,
  typeName: string
): boolean {
  const size = doc.content.size;
  const start = Math.max(0, Math.min(from, size));
  let end = Math.max(start, Math.min(to, size));
  if (start === end) {
    const node = doc.nodeAt(start) ?? (start > 0 ? doc.nodeAt(start - 1) : null);
    if (node?.type.name === typeName) return true;
    if (end < size) end += 1;
    else if (start === size && size > 0) {
      const prev = doc.nodeAt(size - 1);
      return prev?.type.name === typeName;
    }
  }
  if (start >= end) return false;
  let found = false;
  doc.nodesBetween(start, end, (node) => {
    if (node.type.name === typeName) {
      found = true;
      return false;
    }
  });
  return found;
}

/**
 * True when a transaction inserts, deletes, or rewrites a node of `typeName`.
 * Body typing next to other nodes returns false — do not walk the essay.
 */
export function transactionTouchesNodeType(
  tr: Transaction,
  oldDoc: PMNode,
  newDoc: PMNode,
  typeName: string
): boolean {
  if (!tr.docChanged) return false;
  const changed = changedRangeInNewDoc(tr);
  if (
    changed &&
    rangeContainsNodeType(newDoc, changed.from, changed.to, typeName)
  ) {
    return true;
  }
  let doc = oldDoc;
  for (const step of tr.steps) {
    const from =
      "from" in step && typeof (step as { from: unknown }).from === "number"
        ? (step as { from: number }).from
        : null;
    const to =
      "to" in step && typeof (step as { to: unknown }).to === "number"
        ? (step as { to: number }).to
        : from;
    if (
      from != null &&
      to != null &&
      rangeContainsNodeType(doc, from, to, typeName)
    ) {
      return true;
    }
    const result = step.apply(doc);
    if (result.doc) doc = result.doc;
  }
  return false;
}
