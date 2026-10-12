/**
 * Where BlogIDE and GitHub last agreed on an essay, and what each side did
 * since: the GitHub commits after that point, and whether the BlogIDE draft
 * moved on. Feeds the three-way merge in the pull dialog.
 */

import { gitBlobSha } from "@/lib/github/blobSha";
import {
  fetchGithubBlob,
  fetchGithubFileAtRef,
  fetchGithubPathCommits,
  type GithubPathCommit,
} from "@/lib/github/client";
import { loadGithubSyncBase } from "@/lib/github/syncBase";

export type GithubPullHistory = {
  /** The last version both sides had, or null when it can't be found. */
  base: {
    markdown: string;
    /** "recorded": a push/pull on this device; "history": matched a saved BlogIDE version. */
    source: "recorded" | "history";
    /** The GitHub commit with that version, when it was found in history. */
    commit: GithubPathCommit | null;
    /** When this device recorded the sync. */
    syncedAt: string | null;
  } | null;
  /** Commits that touched the file after the base (newest first). */
  remoteCommits: GithubPathCommit[];
  /** Only the newest commits were checked; there may be more. */
  remoteCommitsTruncated: boolean;
  /** Last BlogIDE save (ISO), when known. */
  localEditedAt: string | null;
  localChanged: boolean;
  remoteChanged: boolean;
};

const HISTORY_COMMIT_LIMIT = 10;

const SIGNED_ASSET_URL =
  /https?:\/\/[^\s)"'<>]+\/storage\/v1\/object\/sign\/([^\s)"'<>?]+)\?token=[^\s)"'<>&]+/g;

/**
 * Rewrite signed Storage URLs in `text` to the ones `reference` uses for the
 * same file. Re-signing changes only the token, which isn't an edit; aligning
 * keeps it out of merges, diffs and "you changed this" checks.
 */
export function alignSignedAssetUrls(text: string, reference: string): string {
  const fresh = new Map<string, string>();
  for (const match of reference.matchAll(SIGNED_ASSET_URL)) {
    fresh.set(match[1], match[0]);
  }
  if (fresh.size === 0) return text;
  return text.replace(
    SIGNED_ASSET_URL,
    (url: string, path: string) => fresh.get(path) ?? url
  );
}

function normalizeNewlines(text: string): string {
  return text.replace(/\r\n/g, "\n");
}

/** True when `after` differs from `before` by more than signed-URL tokens. */
export function changedSince(before: string, after: string): boolean {
  return (
    normalizeNewlines(alignSignedAssetUrls(before, after)) !==
    normalizeNewlines(after)
  );
}

export async function loadGithubPullHistory(input: {
  token: string;
  repo: string;
  branch: string;
  path: string;
  nodeId: string;
  localMarkdown: string;
  remoteMarkdown: string;
  localEditedAt: string | null;
  /** BlogIDE's saved versions of this essay (newest first). */
  loadRevisions: () => Promise<string[]>;
}): Promise<GithubPullHistory> {
  const recorded = loadGithubSyncBase(input.nodeId, input.repo, input.branch);
  const known = new Set<string>([await gitBlobSha(input.localMarkdown)]);
  try {
    for (const markdown of await input.loadRevisions()) {
      known.add(await gitBlobSha(markdown));
    }
  } catch {
    // History is a hint; the recorded sync point may still be enough.
  }

  const commits = await fetchGithubPathCommits({
    token: input.token,
    repo: input.repo,
    branch: input.branch,
    path: input.path,
    limit: HISTORY_COMMIT_LIMIT,
  });
  const remoteSha = await gitBlobSha(input.remoteMarkdown);

  let base: GithubPullHistory["base"] = null;
  const remoteCommits: GithubPathCommit[] = [];
  for (const [index, commit] of commits.entries()) {
    // The newest commit that touched the file holds the current remote.
    const entry =
      index === 0
        ? { sha: remoteSha, content: input.remoteMarkdown }
        : await fetchGithubFileAtRef({
            token: input.token,
            repo: input.repo,
            ref: commit.sha,
            path: input.path,
          });
    const isRecorded = Boolean(entry && entry.sha === recorded?.blobSha);
    if (entry && (isRecorded || known.has(entry.sha))) {
      base = {
        markdown: entry.content,
        source: isRecorded ? "recorded" : "history",
        commit,
        syncedAt: isRecorded ? (recorded?.at ?? null) : null,
      };
      break;
    }
    remoteCommits.push(commit);
  }

  // Not found among the newest commits: there may be more since the base.
  const truncated = !base && commits.length >= HISTORY_COMMIT_LIMIT;
  if (!base && recorded) {
    const markdown =
      recorded.blobSha === remoteSha
        ? input.remoteMarkdown
        : await fetchGithubBlob({
            token: input.token,
            repo: input.repo,
            sha: recorded.blobSha,
          });
    if (markdown != null) {
      base = {
        markdown,
        source: "recorded",
        commit: null,
        syncedAt: recorded.at,
      };
    }
  }

  return {
    base,
    remoteCommits,
    remoteCommitsTruncated: truncated,
    localEditedAt: input.localEditedAt,
    localChanged: base ? changedSince(base.markdown, input.localMarkdown) : true,
    remoteChanged: base
      ? changedSince(
          alignSignedAssetUrls(base.markdown, input.localMarkdown),
          alignSignedAssetUrls(input.remoteMarkdown, input.localMarkdown)
        )
      : true,
  };
}

/** One line on who changed what since the last sync, for the pull dialog. */
export function githubPullSituation(
  history: GithubPullHistory
): "github-ahead" | "blogide-ahead" | "diverged" | "unknown" | "in-sync" {
  if (!history.base) return "unknown";
  if (history.localChanged && history.remoteChanged) return "diverged";
  if (history.localChanged) return "blogide-ahead";
  if (history.remoteChanged) return "github-ahead";
  return "in-sync";
}
