import type { Node as PMNode } from "@tiptap/pm/model";
import type { Mapping } from "@tiptap/pm/transform";
import type { Transaction } from "@tiptap/pm/state";
import type { HarperHighlightState, HarperIssue } from "@/lib/editor/harper/types";

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

export function mapHarperIssue(
  issue: HarperIssue,
  mapping: Mapping
): HarperIssue | null {
  const from = mapping.map(issue.from, 1);
  const to = mapping.map(issue.to, -1);
  if (to <= from) return null;
  if (from === issue.from && to === issue.to) return issue;
  return { ...issue, from, to };
}

function isAtomOnlyChange(doc: PMNode, from: number, to: number): boolean {
  const node = doc.nodeAt(from);
  if (!node || !node.isAtom || node.isText) return false;
  return to <= from + node.nodeSize;
}

/** Range whose underlines should be cleared for this edit. */
export function dropRangeForChange(doc: PMNode, changed: DocRange): DocRange {
  if (isAtomOnlyChange(doc, changed.from, changed.to)) return changed;
  return expandToWord(doc, changed.from, changed.to);
}

/**
 * Keep underlines through edits (browser-style). Drop only marks that overlap
 * the edited word so the word being typed is not stuck with a stale squiggle.
 */
export function mapHarperState(
  value: HarperHighlightState,
  tr: Transaction
): HarperHighlightState {
  if (value.issues.length === 0) return value;
  const changed = changedRangeInNewDoc(tr);
  const drop = changed ? dropRangeForChange(tr.doc, changed) : null;
  const issues: HarperIssue[] = [];
  for (const issue of value.issues) {
    const mapped = mapHarperIssue(issue, tr.mapping);
    if (!mapped) continue;
    if (drop && rangesOverlap(mapped.from, mapped.to, drop.from, drop.to)) {
      continue;
    }
    issues.push(mapped);
  }
  const activeId =
    value.activeId && issues.some((issue) => issue.id === value.activeId)
      ? value.activeId
      : null;
  if (
    issues.length === value.issues.length &&
    activeId === value.activeId &&
    issues.every((issue, index) => issue === value.issues[index])
  ) {
    return value;
  }
  return { issues, activeId };
}

export function issuesFingerprint(issues: HarperIssue[]): string {
  return issues
    .map((issue) => `${issue.from}:${issue.to}:${issue.kind}:${issue.problem}`)
    .join("|");
}

export function preserveActiveId(
  prev: HarperHighlightState,
  issues: HarperIssue[]
): string | null {
  if (!prev.activeId) return null;
  if (issues.some((issue) => issue.id === prev.activeId)) return prev.activeId;
  const prevIssue = prev.issues.find((issue) => issue.id === prev.activeId);
  if (!prevIssue) return null;
  const exact = issues.find(
    (issue) =>
      issue.from === prevIssue.from &&
      issue.to === prevIssue.to &&
      issue.kind === prevIssue.kind
  );
  if (exact) return exact.id;
  const overlap = issues.find(
    (issue) =>
      issue.problem === prevIssue.problem &&
      rangesOverlap(issue.from, issue.to, prevIssue.from, prevIssue.to)
  );
  return overlap?.id ?? null;
}

const CACHE_MAX = 256;

export function cacheGet<T>(cache: Map<string, T>, key: string): T | undefined {
  const value = cache.get(key);
  if (value === undefined) return undefined;
  cache.delete(key);
  cache.set(key, value);
  return value;
}

export function cacheSet<T>(cache: Map<string, T>, key: string, value: T): void {
  if (cache.has(key)) cache.delete(key);
  cache.set(key, value);
  while (cache.size > CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}
