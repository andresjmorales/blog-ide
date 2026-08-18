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
  extra?: { stale?: boolean; health?: GithubMapStatus["health"]; detail?: string }
): GithubMapStatus {
  const stale = extra?.stale ?? false;
  if (extra?.health) {
    return {
      ...binding,
      health: extra.health,
      candidates: [],
      stale,
      detail: extra.detail,
    };
  }
  if (!index) {
    return {
      ...binding,
      health: "unchecked",
      candidates: [],
      stale,
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
    detail: present
      ? undefined
      : candidates.length > 0
        ? `Mapped path is missing; found ${candidates.join(", ")}`
        : "Mapped path is missing on GitHub",
  };
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

export function githubStatusTitle(status: GithubMapStatus): string {
  const repoPath = `${status.repo}/${status.path || "(repo root)"}`;
  if (status.stale) {
    return `GitHub mapping lost. ${repoPath}`;
  }
  if (status.health === "ok") {
    return `GitHub: ${repoPath}`;
  }
  if (status.health === "missing") {
    const extra =
      status.candidates.length > 0
        ? ` Found ${status.candidates.join(", ")}.`
        : "";
    return `GitHub mapping broken: ${repoPath} is missing.${extra}`;
  }
  if (status.health === "error") {
    return `GitHub: could not check ${repoPath}. ${status.detail ?? ""}`.trim();
  }
  return `GitHub: ${repoPath} (not checked)`;
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
