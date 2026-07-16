import type { WorkspaceNode } from "@/lib/workspace/types";

export function getTrashNode(
  nodes: WorkspaceNode[]
): WorkspaceNode | undefined {
  return nodes.find((n) => n.system_key === "trash");
}

/** True if node is the Trash folder or nested under it. */
export function isInTrash(
  nodeId: string,
  nodes: WorkspaceNode[],
  trashId?: string | null
): boolean {
  const trash = trashId ?? getTrashNode(nodes)?.id;
  if (!trash) return false;
  if (nodeId === trash) return true;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  let walk: string | null | undefined = nodeId;
  while (walk) {
    if (walk === trash) return true;
    walk = byId.get(walk)?.parent_id ?? null;
  }
  return false;
}

export function isScratchpad(node: WorkspaceNode): boolean {
  return (
    node.kind === "document" &&
    node.pinned &&
    node.name.toLowerCase() === "scratchpad.md"
  );
}

/** Collect this node and all descendants (documents and folders). */
export function collectSubtreeIds(
  rootId: string,
  nodes: WorkspaceNode[]
): string[] {
  const children = new Map<string | null, WorkspaceNode[]>();
  for (const node of nodes) {
    const key = node.parent_id;
    const list = children.get(key) ?? [];
    list.push(node);
    children.set(key, list);
  }
  const out: string[] = [];
  const stack = [rootId];
  while (stack.length) {
    const id = stack.pop()!;
    out.push(id);
    for (const child of children.get(id) ?? []) {
      stack.push(child.id);
    }
  }
  return out;
}

export function documentIdsInSubtree(
  rootId: string,
  nodes: WorkspaceNode[]
): string[] {
  const ids = new Set(collectSubtreeIds(rootId, nodes));
  return nodes
    .filter((n) => ids.has(n.id) && n.kind === "document")
    .map((n) => n.id);
}

/**
 * Folders eligible as Move-to targets for `movingId`.
 * Excludes Trash, the node itself, and descendants (cycle).
 */
export function eligibleMoveFolders(
  nodes: WorkspaceNode[],
  movingId: string,
  options?: { includeTrash?: boolean }
): WorkspaceNode[] {
  const trashId = getTrashNode(nodes)?.id;
  const blocked = new Set(collectSubtreeIds(movingId, nodes));
  return nodes
    .filter((n) => {
      if (n.kind !== "folder") return false;
      if (blocked.has(n.id)) return false;
      if (!options?.includeTrash && n.id === trashId) return false;
      return true;
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function folderPathLabel(
  folderId: string | null,
  nodes: WorkspaceNode[]
): string {
  if (folderId == null) return "Workspace root";
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const parts: string[] = [];
  let walk: string | null = folderId;
  while (walk) {
    const node = byId.get(walk);
    if (!node) break;
    parts.unshift(node.name);
    walk = node.parent_id;
  }
  return parts.join("/") || "Workspace root";
}
