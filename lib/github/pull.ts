import {
  fetchGithubFileContent,
  fetchGithubTreeIndex,
  githubErrorCopy,
} from "@/lib/github/client";
import {
  documentBindingsInScope,
  resolveGithubBindings,
} from "@/lib/github/files";
import {
  folderPathLabel,
  listSameNamedDocuments,
} from "@/lib/workspace/tree";
import { getLocalDoc } from "@/lib/db/indexed";
import { saveLocal, syncDocument } from "@/lib/sync/engine";
import {
  findBasenameCandidates,
  githubUnimportedLookalikes,
  unmappedBlobsUnderFolderMaps,
} from "@/lib/github/status";
import type {
  GithubRemoteSettings,
  GithubResolvedBinding,
} from "@/lib/github/types";
import type { WorkspaceNode } from "@/lib/workspace/types";
import { fetchRemoteDocument } from "@/lib/workspace/api";

export type GithubPullFile = {
  nodeId: string;
  label: string;
  repo: string;
  branch: string;
  mappedPath: string;
  pullPath: string;
  localMarkdown: string;
  /** Contents keyed by repo path (mapped path + any move candidates). */
  remotes: Record<string, string | null>;
  candidates: string[];
  identical: boolean;
  workspaceTwins: Array<{ nodeId: string; label: string }>;
};

export type GithubPullPlan = {
  files: GithubPullFile[];
  /**
   * Markdown files under a mapped GitHub folder that have no BlogIDE document.
   * Pull never imports these (that would create a duplicate essay).
   */
  unmapped: Array<{
    repo: string;
    branch: string;
    path: string;
    /** BlogIDE essay this extra GitHub file looks like a move of. */
    looksLike?: string;
  }>;
};

function normalizeNewlines(text: string): string {
  return text.replace(/\r\n/g, "\n");
}

export async function prepareGithubPull(input: {
  nodes: WorkspaceNode[];
  settings: GithubRemoteSettings;
  token: string;
  localBodies: Map<string, string>;
  scope: "workspace" | { nodeId: string };
}): Promise<GithubPullPlan> {
  const bindings = resolveGithubBindings({
    nodes: input.nodes,
    maps: input.settings.maps,
    defaultRepo: input.settings.repo,
    defaultBranch: input.settings.branch,
  });
  const docs = documentBindingsInScope(bindings, input.nodes, input.scope);
  if (docs.length === 0) {
    throw new Error(
      "This item is not mapped to GitHub. Map it first, or pull a mapped folder."
    );
  }

  const byRepo = new Map<string, GithubResolvedBinding[]>();
  for (const binding of docs) {
    const key = `${binding.repo}#${binding.branch}`;
    const list = byRepo.get(key) ?? [];
    list.push(binding);
    byRepo.set(key, list);
  }

  const files: GithubPullFile[] = [];
  const unmapped: GithubPullPlan["unmapped"] = [];
  for (const group of byRepo.values()) {
    const first = group[0];
    let blobs: string[] = [];
    try {
      const index = await fetchGithubTreeIndex({
        token: input.token,
        repo: first.repo,
        branch: first.branch,
      });
      blobs = index.blobs;
      const extras = unmappedBlobsUnderFolderMaps(bindings, index.blobs).filter(
        (row) => row.repo === first.repo && row.branch === first.branch
      );
      const looks = githubUnimportedLookalikes(
        bindings.filter(
          (binding) =>
            binding.repo === first.repo && binding.branch === first.branch
        ),
        index.blobs,
        input.nodes
      );
      const looksByPath = new Map(
        looks.map((row) => [row.path, row.matchesLabel])
      );
      unmapped.push(
        ...extras.map((row) => ({
          ...row,
          looksLike: looksByPath.get(row.path),
        }))
      );
    } catch (error) {
      throw new Error(githubErrorCopy(error));
    }

    for (const binding of group) {
      const candidates = blobs.includes(binding.path)
        ? []
        : findBasenameCandidates(binding.path, blobs);
      const pullPath =
        blobs.includes(binding.path) || candidates.length === 0
          ? binding.path
          : candidates[0];
      const pathsToFetch = [
        ...new Set([binding.path, pullPath, ...candidates]),
      ];
      const remotes: Record<string, string | null> = {};
      for (const path of pathsToFetch) {
        try {
          remotes[path] = await fetchGithubFileContent({
            token: input.token,
            repo: binding.repo,
            branch: binding.branch,
            path,
          });
        } catch (error) {
          throw new Error(githubErrorCopy(error));
        }
      }
      const remoteMarkdown = remotes[pullPath] ?? null;
      const localMarkdown = input.localBodies.get(binding.nodeId) ?? "";
      const identical =
        remoteMarkdown !== null &&
        normalizeNewlines(remoteMarkdown) === normalizeNewlines(localMarkdown);
      files.push({
        nodeId: binding.nodeId,
        label: folderPathLabel(binding.nodeId, input.nodes),
        repo: binding.repo,
        branch: binding.branch,
        mappedPath: binding.path,
        pullPath,
        localMarkdown,
        remotes,
        candidates,
        identical,
        workspaceTwins: listSameNamedDocuments(input.nodes, binding.nodeId),
      });
    }
  }

  return { files, unmapped };
}

export function githubPullBaseVersion(
  localBaseVersion: number | undefined,
  remoteVersion: number | undefined
): number {
  const local = Number(localBaseVersion);
  const remote = Number(remoteVersion);
  const knownLocal = Number.isFinite(local) && local > 0 ? local : 0;
  const knownRemote = Number.isFinite(remote) && remote > 0 ? remote : 0;
  return Math.max(knownLocal, knownRemote, 1);
}

export async function applyGithubPullToDocument(input: {
  nodeId: string;
  markdown: string;
  isOpen: boolean;
  nodes: WorkspaceNode[];
  applyMarkdown?: (markdown: string) => void;
}): Promise<void> {
  const exists = input.nodes.some(
    (node) => node.id === input.nodeId && node.kind === "document"
  );
  if (!exists) {
    throw new Error(
      "That essay is gone. Pull will not create a new BlogIDE file from GitHub."
    );
  }
  if (input.isOpen && input.applyMarkdown) {
    input.applyMarkdown(input.markdown);
    return;
  }
  const remote = await fetchRemoteDocument(input.nodeId);
  if (!remote) {
    throw new Error(
      "That essay is gone. Pull will not create a new BlogIDE file from GitHub."
    );
  }
  const local = await getLocalDoc(input.nodeId);
  await saveLocal(
    input.nodeId,
    input.markdown,
    githubPullBaseVersion(local?.baseVersion, Number(remote.version))
  );
  await syncDocument(input.nodeId);
}
