/**
 * Map workspace documents onto GitHub repo paths.
 * Trash is always excluded. One-way: we never delete extra files in the repo.
 */

import {
  ensureMarkdownFileName,
  joinGithubPath,
  sanitizeGithubFileName,
} from "@/lib/github/repo";
import type { GithubFile, GithubSyncMap } from "@/lib/github/types";
import {
  collectSubtreeIds,
  folderPathLabel,
  getTrashNode,
  isInTrash,
} from "@/lib/workspace/tree";
import type { WorkspaceNode } from "@/lib/workspace/types";

function relativePathUnder(
  nodeId: string,
  rootId: string,
  nodes: WorkspaceNode[]
): string | null {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const node = byId.get(nodeId);
  if (!node || node.kind !== "document") return null;

  const segments: string[] = [ensureMarkdownFileName(node.name)];
  let walk = node.parent_id;
  while (walk && walk !== rootId) {
    const parent = byId.get(walk);
    if (!parent) break;
    segments.unshift(sanitizeGithubFileName(parent.name));
    walk = parent.parent_id;
  }
  if (walk !== rootId && rootId !== nodeId) return null;
  return segments.join("/");
}

function workspaceExportPath(
  nodeId: string,
  nodes: WorkspaceNode[]
): string | null {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const trash = getTrashNode(nodes);
  if (trash && isInTrash(nodeId, nodes, trash.id)) return null;
  const node = byId.get(nodeId);
  if (!node || node.kind !== "document") return null;

  const segments: string[] = [ensureMarkdownFileName(node.name)];
  let walk = node.parent_id;
  while (walk) {
    const parent = byId.get(walk);
    if (!parent) break;
    if (parent.system_key === "trash") return null;
    segments.unshift(sanitizeGithubFileName(parent.name));
    walk = parent.parent_id;
  }
  return segments.join("/");
}

export type GithubTarget = {
  repo: string;
  branch: string;
  files: GithubFile[];
};

export type GithubPushPlanInput = {
  nodes: WorkspaceNode[];
  bodies: Map<string, string>;
  defaultRepo: string;
  defaultBranch: string;
  defaultPath: string;
  maps: GithubSyncMap[];
  scope: "workspace" | { nodeId: string };
};

/** Split a plan that spans multiple repos into separate commits. */
export function buildGithubPushPlans(
  input: GithubPushPlanInput
): GithubTarget[] {
  const { nodes, bodies, maps } = input;
  const defaultRepo = input.defaultRepo.trim();
  const defaultBranch = input.defaultBranch.trim() || "main";
  const defaultPath = input.defaultPath.trim();
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const trash = getTrashNode(nodes);
  const trashIds = new Set(trash ? collectSubtreeIds(trash.id, nodes) : []);
  const mapByNode = new Map(maps.map((m) => [m.nodeId, m]));

  const buckets = new Map<string, GithubTarget>();
  function add(repo: string, branch: string, path: string, nodeId: string) {
    if (!repo || !path) return;
    const key = `${repo}#${branch}`;
    let current = buckets.get(key);
    if (!current) {
      current = { repo, branch, files: [] };
      buckets.set(key, current);
    }
    current.files.push({ path, content: bodies.get(nodeId) ?? "" });
  }

  const consider = (node: WorkspaceNode) => {
    if (node.kind !== "document" || trashIds.has(node.id)) return;
    const mapped = mapByNode.get(node.id);
    if (mapped) {
      add(
        (mapped.repo || defaultRepo).trim(),
        (mapped.branch || defaultBranch).trim() || "main",
        mapped.path.replace(/^\/+/, ""),
        node.id
      );
      return;
    }
    let ancestorMap: GithubSyncMap | undefined;
    let ancestorId: string | null = node.parent_id;
    while (ancestorId && !ancestorMap) {
      ancestorMap = mapByNode.get(ancestorId);
      if (!ancestorMap) ancestorId = byId.get(ancestorId)?.parent_id ?? null;
    }
    if (ancestorMap && ancestorId) {
      const rel = relativePathUnder(node.id, ancestorId, nodes);
      if (!rel) return;
      add(
        (ancestorMap.repo || defaultRepo).trim(),
        (ancestorMap.branch || defaultBranch).trim() || "main",
        joinGithubPath(ancestorMap.path, rel),
        node.id
      );
      return;
    }
    const rel = workspaceExportPath(node.id, nodes);
    if (!rel) return;
    add(defaultRepo, defaultBranch, joinGithubPath(defaultPath, rel), node.id);
  };

  if (input.scope === "workspace") {
    if (!defaultRepo && maps.length === 0) {
      throw new Error("Set a default GitHub repo in Settings first.");
    }
    for (const node of nodes) consider(node);
  } else {
    const root = byId.get(input.scope.nodeId);
    if (!root) throw new Error("That folder or document is gone.");
    if (trashIds.has(root.id)) throw new Error("Trash is not pushed to GitHub.");
    const mapped = mapByNode.get(root.id);
    const repo = (mapped?.repo || defaultRepo).trim();
    const branch = (mapped?.branch || defaultBranch).trim() || "main";
    if (!repo) {
      throw new Error("Set a GitHub repo on this item or in Settings.");
    }
    if (root.kind === "document") {
      const path =
        mapped?.path?.replace(/^\/+/, "") ||
        joinGithubPath(defaultPath, ensureMarkdownFileName(root.name));
      add(repo, branch, path, root.id);
    } else {
      for (const node of nodes) {
        if (node.kind !== "document" || trashIds.has(node.id)) continue;
        const rel = relativePathUnder(node.id, root.id, nodes);
        if (!rel) continue;
        const docMap = mapByNode.get(node.id);
        if (docMap) {
          add(
            (docMap.repo || repo).trim(),
            (docMap.branch || branch).trim() || "main",
            docMap.path.replace(/^\/+/, ""),
            node.id
          );
        } else {
          add(
            repo,
            branch,
            joinGithubPath(mapped?.path || defaultPath, rel),
            node.id
          );
        }
      }
    }
  }

  const used = [...buckets.values()].filter((b) => b.files.length > 0);
  if (used.length === 0) {
    throw new Error("No documents to push (Trash is skipped).");
  }
  return used;
}

/** Build one GitHub commit payload (first repo/branch if several). */
export function buildGithubPushPlan(input: GithubPushPlanInput): GithubTarget {
  return buildGithubPushPlans(input)[0];
}

/** Folders and documents that can be mapped (Trash excluded). */
export function listGithubMapNodes(
  nodes: WorkspaceNode[]
): Array<{ id: string; label: string; kind: "folder" | "document" }> {
  const trash = getTrashNode(nodes);
  return nodes
    .filter(
      (node) =>
        (node.kind === "folder" || node.kind === "document") &&
        node.system_key !== "trash" &&
        !isInTrash(node.id, nodes, trash?.id)
    )
    .map((node) => ({
      id: node.id,
      label: folderPathLabel(node.id, nodes),
      kind: node.kind as "folder" | "document",
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}
