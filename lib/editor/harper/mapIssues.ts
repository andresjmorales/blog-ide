import type { Node as PMNode } from "@tiptap/pm/model";
import type { Mapping } from "@tiptap/pm/transform";
import type { Transaction } from "@tiptap/pm/state";
import type { HarperHighlightState, HarperIssue } from "@/lib/editor/harper/types";
import {
  changedRangeInNewDoc,
  expandToWord,
  isAtomOnlyChange,
  isWordChar,
  rangesOverlap,
  type DocRange,
} from "@/lib/editor/changedRange";

export {
  changedRangeInNewDoc,
  expandToWord,
  isAtomOnlyChange,
  isWordChar,
  rangesOverlap,
  type DocRange,
};

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
