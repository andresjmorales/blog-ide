/**
 * Does GitHub have a version of an essay that BlogIDE never had? That is
 * the case to warn about: keep editing and you'll need a merge; push and
 * you overwrite those commits. A file GitHub has that matches the sync
 * point, the current draft, or a saved BlogIDE version is not "ahead".
 */

import { gitBlobSha } from "@/lib/github/blobSha";
import {
  loadGithubSyncBase,
  recordGithubSyncBases,
} from "@/lib/github/syncBase";
import { listDocumentRevisions } from "@/lib/workspace/api";

export async function githubRemoteAhead(input: {
  nodeId: string;
  repo: string;
  branch: string;
  path: string;
  /** Blob sha of the file on GitHub now; missing files are never ahead. */
  remoteSha: string | null | undefined;
  localMarkdown: string;
  /** BlogIDE's saved versions (newest first); defaults to the cloud history. */
  loadRevisions?: () => Promise<string[]>;
}): Promise<boolean> {
  const { remoteSha } = input;
  if (!remoteSha) return false;
  const agree = () =>
    recordGithubSyncBases([
      {
        nodeId: input.nodeId,
        repo: input.repo,
        branch: input.branch,
        path: input.path,
        blobSha: remoteSha,
      },
    ]);

  if ((await gitBlobSha(input.localMarkdown)) === remoteSha) {
    agree();
    return false;
  }
  const recorded = loadGithubSyncBase(input.nodeId, input.repo, input.branch);
  if (recorded?.blobSha === remoteSha) return false;

  const loadRevisions =
    input.loadRevisions ??
    (async () =>
      (await listDocumentRevisions(input.nodeId)).map((row) => row.markdown));
  try {
    for (const markdown of await loadRevisions()) {
      if ((await gitBlobSha(markdown)) === remoteSha) {
        // GitHub has an older BlogIDE version: that's where they last agreed.
        agree();
        return false;
      }
    }
  } catch {
    // Without history, a recorded sync point is the only evidence left.
  }
  return true;
}
