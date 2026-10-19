/**
 * What to do when a push finds the cloud copy moved on. With the version the
 * draft was based on in hand, most of these are not real conflicts: the
 * draft made no edits of its own (a stale dirty flag, re-signed image links),
 * or the two sides changed different paragraphs and merge cleanly.
 */

import { mergeThreeWay, resolveThreeWay } from "@/lib/markdown/merge3";
import {
  anchorFootnotes,
  releaseFootnotes,
} from "@/lib/markdown/footnoteAnchors";
import { normalize } from "@/lib/markdown/pipeline";
import { alignSignedAssetUrls } from "@/lib/github/syncHistory";

export type DraftReconcile =
  /** The draft has no edits of its own: take the cloud copy. */
  | { kind: "take-remote" }
  /** Both sides' edits combined; push this at the cloud version. */
  | { kind: "merged"; markdown: string }
  /** Both sides changed the same lines. */
  | { kind: "conflict" };

/** Same text once signed-URL tokens and whitespace are set aside. */
function sameText(a: string, b: string): boolean {
  return normalize(alignSignedAssetUrls(a, b)) === normalize(b);
}

function merge(base: string, local: string, remote: string) {
  // Re-signed image links are not edits; footnotes merge by their text,
  // not their number (as in GitHub pulls).
  return mergeThreeWay(
    anchorFootnotes(alignSignedAssetUrls(base, local)),
    anchorFootnotes(local),
    anchorFootnotes(alignSignedAssetUrls(remote, local))
  );
}

export function reconcileDraft(
  base: string,
  local: string,
  remote: string
): DraftReconcile {
  if (sameText(base, local) || sameText(local, remote)) {
    return { kind: "take-remote" };
  }
  if (sameText(base, remote)) return { kind: "merged", markdown: local };
  const result = merge(base, local, remote);
  if (result.conflicts > 0) return { kind: "conflict" };
  const markdown = releaseFootnotes(resolveThreeWay(result));
  if (sameText(markdown, remote)) return { kind: "take-remote" };
  return { kind: "merged", markdown };
}

/**
 * Carry typing made on top of `base` over to `next`. Lines both changed
 * keep the typing — it is the newest edit, and `next` stays in version
 * history.
 */
export function rebaseDraft(base: string, draft: string, next: string): string {
  if (sameText(base, draft)) return next;
  return releaseFootnotes(resolveThreeWay(merge(base, draft, next), {}, "local"));
}
