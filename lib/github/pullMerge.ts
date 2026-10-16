/**
 * What a pull writes into BlogIDE: GitHub's file outright, or a three-way
 * merge of BlogIDE's edits and GitHub's commits since the last sync.
 */

import {
  mergeThreeWay,
  resolveThreeWay,
  type ConflictChoice,
  type ThreeWayMerge,
} from "@/lib/markdown/merge3";
import type { GithubPullFile } from "@/lib/github/pull";
import {
  anchorFootnotes,
  releaseFootnotes,
} from "@/lib/markdown/footnoteAnchors";
import {
  alignSignedAssetUrls,
  githubPullSituation,
} from "@/lib/github/syncHistory";

export type GithubPullStrategy = "merge" | "replace";

export type GithubPullSituation =
  | ReturnType<typeof githubPullSituation>
  | "no-history";

/** History applies only to the path it was read for. */
export function pullSituation(
  file: GithubPullFile,
  path: string
): GithubPullSituation {
  if (path !== file.pullPath || !file.history) return "no-history";
  return githubPullSituation(file.history);
}

/** Three-way merge when both sides changed since the last sync. */
export function pullMerge(
  file: GithubPullFile,
  path: string
): ThreeWayMerge | null {
  if (pullSituation(file, path) !== "diverged") return null;
  const base = file.history?.base;
  const remote = file.remotes[path];
  if (!base || remote == null) return null;
  // Re-signed image links are not edits: compare with BlogIDE's links.
  // Footnotes merge by their text, not their number (see footnoteAnchors),
  // so a kept paragraph keeps its own notes and renumbers never conflict.
  return mergeThreeWay(
    anchorFootnotes(alignSignedAssetUrls(base.markdown, file.localMarkdown)),
    anchorFootnotes(file.localMarkdown),
    anchorFootnotes(alignSignedAssetUrls(remote, file.localMarkdown))
  );
}

export function defaultPullStrategy(
  file: GithubPullFile,
  path = file.pullPath
): GithubPullStrategy {
  return pullSituation(file, path) === "diverged" ? "merge" : "replace";
}

/**
 * Preselect files where pulling gains something. When only BlogIDE moved on
 * since the last sync, pulling would just undo those edits.
 */
export function defaultPullSelected(file: GithubPullFile): boolean {
  const remote = file.remotes[file.pullPath] ?? null;
  if (remote == null || file.identical) return false;
  const situation = pullSituation(file, file.pullPath);
  return situation !== "blogide-ahead" && situation !== "in-sync";
}

/** The markdown a pull would leave in BlogIDE, or null if nothing to pull. */
export function pullResultMarkdown(
  file: GithubPullFile,
  path: string,
  strategy: GithubPullStrategy,
  choices: Record<number, ConflictChoice> = {}
): string | null {
  const remote = file.remotes[path] ?? null;
  if (remote == null) return null;
  if (strategy === "merge") {
    const merge = pullMerge(file, path);
    if (merge) return releaseFootnotes(resolveThreeWay(merge, choices));
  }
  return remote;
}
