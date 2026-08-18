/**
 * Compare GitHub maps against a repo tree. Missing mapped paths with the
 * same filename elsewhere are treated as likely moves (git mv).
 */

import {
  githubBasename,
  normalizeGithubPath,
} from "@/lib/github/repo";
import type {
  GithubMapStatus,
  GithubResolvedBinding,
  GithubSyncMap,
  GithubTreeIndex,
} from "@/lib/github/types";
import { folderPathLabel, listSameNamedDocuments } from "@/lib/workspace/tree";
import type { WorkspaceNode } from "@/lib/workspace/types";

const EMPTY_COPY_SIGNALS = {
  workspaceTwins: [] as GithubMapStatus["workspaceTwins"],
  unimportedGithubPaths: [] as string[],
  pathCollisions: [] as GithubMapStatus["pathCollisions"],
};

export function prefixExists(
  path: string,
  index: GithubTreeIndex
): boolean {
  const normalized = normalizeGithubPath(path);
  if (!normalized) return true;
  if (index.trees.includes(normalized)) return true;
  return index.blobs.some(
    (blob) => blob === normalized || blob.startsWith(`${normalized}/`)
  );
}

export function findBasenameCandidates(
  path: string,
  blobPaths: string[]
): string[] {
  const base = githubBasename(path);
  if (!base) return [];
  const normalized = normalizeGithubPath(path);
  return blobPaths.filter(
    (blob) => blob !== normalized && githubBasename(blob) === base
  );
}

export function assessGithubBinding(
  binding: GithubResolvedBinding,
  index: GithubTreeIndex | null,
  extra?: {
    stale?: boolean;
    health?: GithubMapStatus["health"];
    detail?: string;
    workspaceTwins?: GithubMapStatus["workspaceTwins"];
    unimportedGithubPaths?: string[];
    pathCollisions?: GithubMapStatus["pathCollisions"];
  }
): GithubMapStatus {
  const stale = extra?.stale ?? false;
  const copySignals = {
    workspaceTwins: extra?.workspaceTwins ?? EMPTY_COPY_SIGNALS.workspaceTwins,
    unimportedGithubPaths:
      extra?.unimportedGithubPaths ?? EMPTY_COPY_SIGNALS.unimportedGithubPaths,
    pathCollisions: extra?.pathCollisions ?? EMPTY_COPY_SIGNALS.pathCollisions,
  };
  if (extra?.health) {
    return {
      ...binding,
      health: extra.health,
      candidates: [],
      stale,
      ...copySignals,
      detail: extra.detail,
    };
  }
  if (!index) {
    return {
      ...binding,
      health: "unchecked",
      candidates: [],
      stale,
      ...copySignals,
    };
  }

  const present =
    binding.kind === "document"
      ? index.blobs.includes(binding.path)
      : prefixExists(binding.path, index);
  const candidates = present
    ? []
    : findBasenameCandidates(binding.path, index.blobs);

  return {
    ...binding,
    health: present ? "ok" : "missing",
    candidates,
    stale,
    ...copySignals,
    detail: present
      ? undefined
      : candidates.length > 0
        ? `Mapped path is missing; found ${candidates.join(", ")}`
        : "Mapped path is missing on GitHub",
  };
}

export function attachWorkspaceTwins(
  statuses: GithubMapStatus[],
  nodes: WorkspaceNode[]
): GithubMapStatus[] {
  return attachGithubCopySignals(statuses, nodes);
}

/**
 * Same-name BlogIDE twins, duplicate GitHub path maps, and GitHub extras that
 * look like a moved file (never imported as a new essay).
 */
export function attachGithubCopySignals(
  statuses: GithubMapStatus[],
  nodes: WorkspaceNode[],
  lookalikesByNode?: Map<string, string[]>
): GithubMapStatus[] {
  const collisions = collidingMappedDocuments(statuses, nodes);
  return statuses.map((status) => ({
    ...status,
    workspaceTwins:
      status.kind === "document"
        ? listSameNamedDocuments(nodes, status.nodeId)
        : [],
    unimportedGithubPaths: lookalikesByNode?.get(status.nodeId) ?? [],
    pathCollisions: collisions.get(status.nodeId) ?? [],
  }));
}

/** Two or more live BlogIDE documents mapped to the same repo path. */
export function collidingMappedDocuments(
  statuses: GithubMapStatus[],
  nodes: WorkspaceNode[]
): Map<string, Array<{ nodeId: string; label: string }>> {
  const groups = new Map<string, GithubMapStatus[]>();
  for (const status of statuses) {
    if (status.kind !== "document" || status.stale) continue;
    const key = `${status.repo}#${status.branch}#${status.path}`;
    const list = groups.get(key) ?? [];
    list.push(status);
    groups.set(key, list);
  }
  const out = new Map<string, Array<{ nodeId: string; label: string }>>();
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    for (const status of group) {
      out.set(
        status.nodeId,
        group
          .filter((other) => other.nodeId !== status.nodeId)
          .map((other) => ({
            nodeId: other.nodeId,
            label: folderPathLabel(other.nodeId, nodes) || other.nodeId,
          }))
      );
    }
  }
  return out;
}

/** GitHub blobs under a mapped folder that have no BlogIDE document. Never imported. */
export function unmappedBlobsUnderFolderMaps(
  bindings: GithubResolvedBinding[],
  blobs: string[]
): Array<{ repo: string; branch: string; path: string }> {
  const folders = bindings.filter((b) => b.kind === "folder" && b.source === "direct");
  const mappedFiles = new Set(
    bindings.filter((b) => b.kind === "document").map((b) => `${b.repo}#${b.branch}#${b.path}`)
  );
  const extras: Array<{ repo: string; branch: string; path: string }> = [];
  const seen = new Set<string>();
  for (const folder of folders) {
    const prefix = normalizeGithubPath(folder.path);
    for (const blob of blobs) {
      const under =
        !prefix || blob === prefix || blob.startsWith(`${prefix}/`);
      if (!under) continue;
      if (!blob.toLowerCase().endsWith(".md")) continue;
      const key = `${folder.repo}#${folder.branch}#${blob}`;
      if (mappedFiles.has(key) || seen.has(key)) continue;
      seen.add(key);
      extras.push({ repo: folder.repo, branch: folder.branch, path: blob });
    }
  }
  return extras;
}

/**
 * Extra GitHub markdown whose filename matches an existing mapped BlogIDE
 * essay. Typical after `git mv` into another mapped folder. Never imported.
 */
export function githubUnimportedLookalikes(
  bindings: GithubResolvedBinding[],
  blobs: string[],
  nodes: WorkspaceNode[]
): Array<{
  path: string;
  repo: string;
  branch: string;
  matchesNodeId: string;
  matchesLabel: string;
}> {
  const extras = unmappedBlobsUnderFolderMaps(bindings, blobs);
  const docs = bindings.filter((binding) => binding.kind === "document");
  const out: Array<{
    path: string;
    repo: string;
    branch: string;
    matchesNodeId: string;
    matchesLabel: string;
  }> = [];
  const seen = new Set<string>();
  for (const extra of extras) {
    const extraBase = githubBasename(extra.path).toLowerCase();
    if (!extraBase) continue;
    for (const doc of docs) {
      if (doc.repo !== extra.repo || doc.branch !== extra.branch) continue;
      if (githubBasename(doc.path).toLowerCase() !== extraBase) continue;
      const key = `${doc.nodeId}#${extra.path}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        path: extra.path,
        repo: extra.repo,
        branch: extra.branch,
        matchesNodeId: doc.nodeId,
        matchesLabel: folderPathLabel(doc.nodeId, nodes),
      });
    }
  }
  return out;
}

export function assessGithubBindings(
  bindings: GithubResolvedBinding[],
  indexes: Map<string, GithubTreeIndex | Error | null>
): GithubMapStatus[] {
  return bindings.map((binding) => {
    const key = `${binding.repo}#${binding.branch}`;
    const index = indexes.get(key);
    if (index instanceof Error) {
      return assessGithubBinding(binding, null, {
        health: "error",
        detail: index.message,
      });
    }
    return assessGithubBinding(binding, index ?? null);
  });
}

export function treeIndexKey(repo: string, branch: string): string {
  return `${repo.trim()}#${(branch.trim() || "main")}`;
}

export type GithubPushIssue = {
  nodeId: string;
  repo: string;
  branch: string;
  plannedPath: string;
  /** Same filename at another path — pushing the old path would duplicate. */
  candidates: string[];
};

export function inspectPushFiles(
  files: Array<{ path: string; nodeId?: string }>,
  repo: string,
  branch: string,
  index: GithubTreeIndex
): GithubPushIssue[] {
  const issues: GithubPushIssue[] = [];
  for (const file of files) {
    const path = normalizeGithubPath(file.path);
    if (!path || index.blobs.includes(path)) continue;
    const candidates = findBasenameCandidates(path, index.blobs);
    if (candidates.length === 0) continue;
    issues.push({
      nodeId: file.nodeId ?? "",
      repo,
      branch,
      plannedPath: path,
      candidates,
    });
  }
  return issues;
}

function copySignalSuffix(status: GithubMapStatus): string {
  const twins =
    status.workspaceTwins.length > 0
      ? ` Another BlogIDE file: ${status.workspaceTwins.map((t) => t.label).join(", ")}.`
      : "";
  const collisions =
    status.pathCollisions.length > 0
      ? ` Same GitHub path also mapped from ${status.pathCollisions.map((t) => t.label).join(", ")}.`
      : "";
  const unimported =
    status.unimportedGithubPaths.length > 0
      ? ` GitHub also has ${status.unimportedGithubPaths.join(", ")}; BlogIDE did not add a second essay.`
      : "";
  return `${twins}${collisions}${unimported}`;
}

export function githubStatusTitle(status: GithubMapStatus): string {
  const repoPath = `${status.repo}/${status.path || "(repo root)"}`;
  if (status.stale) {
    return `GitHub mapping lost. ${repoPath}`;
  }
  if (status.health === "ok") {
    return `GitHub: ${repoPath}.${copySignalSuffix(status)}`;
  }
  if (status.health === "missing") {
    const extra =
      status.candidates.length > 0
        ? ` Found ${status.candidates.join(", ")}.`
        : "";
    return `GitHub mapping broken: ${repoPath} is missing.${extra}${copySignalSuffix(status)}`;
  }
  if (status.health === "error") {
    return `GitHub: could not check ${repoPath}. ${status.detail ?? ""}`.trim();
  }
  return `GitHub: ${repoPath} (not checked)${copySignalSuffix(status)}`;
}

export function unimportedGithubNoticePaths(
  statuses: Iterable<GithubMapStatus>
): string[] {
  const paths = new Set<string>();
  for (const status of statuses) {
    for (const path of status.unimportedGithubPaths) {
      paths.add(path);
    }
  }
  return [...paths].sort();
}

export function remapGithubMaps(
  maps: GithubSyncMap[],
  updates: Array<{
    nodeId: string;
    path: string;
    repo?: string;
    branch?: string;
  }>
): GithubSyncMap[] {
  const next = [...maps];
  for (const update of updates) {
    const index = next.findIndex((map) => map.nodeId === update.nodeId);
    if (index >= 0) {
      next[index] = { ...next[index], path: update.path };
      continue;
    }
    next.push({
      nodeId: update.nodeId,
      path: update.path,
      repo: update.repo ?? "",
      branch: update.branch ?? "",
    });
  }
  return next;
}
