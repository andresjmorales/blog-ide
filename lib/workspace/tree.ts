import type { WorkspaceNode } from "@/lib/workspace/types";

export function getTrashNode(
  nodes: WorkspaceNode[]
): WorkspaceNode | undefined {
  return nodes.find((n) => n.system_key === "trash");
}

export function getInboxNode(
  nodes: WorkspaceNode[]
): WorkspaceNode | undefined {
  return nodes.find((n) => n.system_key === "inbox");
}

/** Document channels under the Inbox folder. */
export function listInboxChannels(nodes: WorkspaceNode[]): WorkspaceNode[] {
  const inbox = getInboxNode(nodes);
  if (!inbox) return [];
  return nodes
    .filter((n) => n.parent_id === inbox.id && n.kind === "document")
    .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));
}

export function getNotesChannel(
  nodes: WorkspaceNode[]
): WorkspaceNode | undefined {
  return listInboxChannels(nodes).find(
    (n) => n.name.toLowerCase() === "notes.md"
  );
}

export function isSystemFolder(node: WorkspaceNode): boolean {
  return node.system_key === "trash" || node.system_key === "inbox";
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
  if (node.system_key === "scratchpad") return true;
  // Legacy fallback for rows created before the scratchpad got a system_key.
  // Root-level only, so a user's own pinned "scratchpad.md" inside a folder
  // is never treated as the system file.
  return (
    node.kind === "document" &&
    node.pinned &&
    node.parent_id === null &&
    node.name.toLowerCase() === "scratchpad.md"
  );
}

/**
 * Sibling ordering for the Files panel: pinned first, then manual position,
 * then name.
 */
export function compareSiblings(a: WorkspaceNode, b: WorkspaceNode): number {
  return (
    Number(b.pinned) - Number(a.pinned) ||
    a.position - b.position ||
    a.name.localeCompare(b.name)
  );
}

/**
 * De-duplicate a name against its would-be siblings (case-insensitive):
 * "essay.md" → "essay (2).md". `excludeId` skips the node being renamed.
 */
export function uniqueSiblingName(
  nodes: WorkspaceNode[],
  parentId: string | null,
  desired: string,
  excludeId?: string
): string {
  const taken = new Set(
    nodes
      .filter((n) => n.parent_id === parentId && n.id !== excludeId)
      .map((n) => n.name.toLowerCase())
  );
  if (!taken.has(desired.toLowerCase())) return desired;

  const isMd = /\.md$/i.test(desired);
  const stem = isMd ? desired.replace(/\.md$/i, "") : desired;
  for (let n = 2; ; n++) {
    const candidate = isMd ? `${stem} (${n}).md` : `${stem} (${n})`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
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

/** Channel label without .md — for terminal / Shell UI. */
export function channelDisplayName(node: WorkspaceNode): string {
  return node.name.replace(/\.md$/i, "");
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
