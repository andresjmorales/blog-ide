import {
  fetchGithubTreeIndex,
  githubErrorCopy,
} from "@/lib/github/client";
import {
  resolveGithubBindings,
  staleGithubMaps,
} from "@/lib/github/files";
import { assessGithubBinding, attachWorkspaceTwins, treeIndexKey } from "@/lib/github/status";
import type {
  GithubMapStatus,
  GithubRemoteSettings,
  GithubTreeIndex,
} from "@/lib/github/types";
import type { WorkspaceNode } from "@/lib/workspace/types";

export async function loadGithubMapStatuses(input: {
  nodes: WorkspaceNode[];
  settings: GithubRemoteSettings;
  token: string | null;
}): Promise<GithubMapStatus[]> {
  const bindings = resolveGithubBindings({
    nodes: input.nodes,
    maps: input.settings.maps,
    defaultRepo: input.settings.repo,
    defaultBranch: input.settings.branch,
  });

  const stale = staleGithubMaps(input.nodes, input.settings.maps);
  const staleStatuses: GithubMapStatus[] = stale.map((map) => ({
    nodeId: map.nodeId,
    kind: "document",
    repo: (map.repo || input.settings.repo).trim(),
    branch: (map.branch || input.settings.branch).trim() || "main",
    path: map.path,
    source: "direct",
    mapNodeId: map.nodeId,
    health: "missing",
    candidates: [],
    stale: true,
    workspaceTwins: [],
    detail: "Mapped item is missing or in Trash",
  }));

  if (!input.token) {
    return attachWorkspaceTwins(
      [
        ...bindings.map((binding) => assessGithubBinding(binding, null)),
        ...staleStatuses,
      ],
      input.nodes
    );
  }

  const keys = [
    ...new Set(bindings.map((b) => treeIndexKey(b.repo, b.branch))),
  ];
  const indexes = new Map<string, GithubTreeIndex | Error | null>();
  await Promise.all(
    keys.map(async (key) => {
      const [repo, branch] = [key.slice(0, key.lastIndexOf("#")), key.slice(key.lastIndexOf("#") + 1)];
      try {
        const index = await fetchGithubTreeIndex({
          token: input.token as string,
          repo,
          branch,
        });
        indexes.set(key, index);
      } catch (error) {
        indexes.set(
          key,
          new Error(githubErrorCopy(error))
        );
      }
    })
  );

  const live = bindings.map((binding) => {
    const index = indexes.get(treeIndexKey(binding.repo, binding.branch));
    if (index instanceof Error) {
      return assessGithubBinding(binding, null, {
        health: "error",
        detail: index.message,
      });
    }
    return assessGithubBinding(binding, index ?? null);
  });

  return attachWorkspaceTwins([...live, ...staleStatuses], input.nodes);
}
