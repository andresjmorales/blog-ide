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

/** Document channels under the Notes (system inbox) folder. */
export function listInboxChannels(nodes: WorkspaceNode[]): WorkspaceNode[] {
  const inbox = getInboxNode(nodes);
  if (!inbox) return [];
  return nodes
    .filter((n) => n.parent_id === inbox.id && n.kind === "document")
    .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));
}

/** Prefer general.md; fall back to legacy notes.md. */
export function getNotesChannel(
  nodes: WorkspaceNode[]
): WorkspaceNode | undefined {
  const channels = listInboxChannels(nodes);
  return (
    channels.find((n) => n.name.toLowerCase() === "general.md") ??
    channels.find((n) => n.name.toLowerCase() === "notes.md")
  );
}

/** Display label for system folders (inbox stays `system_key: "inbox"`). */
export function systemFolderDisplayName(node: WorkspaceNode): string {
  if (node.system_key === "inbox") return "Notes";
  if (node.system_key === "trash") return "Trash";
  return node.name;
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
  // is never treated as the seeded file.
  return (
    node.kind === "document" &&
    node.pinned &&
    node.parent_id === null &&
    node.name.toLowerCase() === "scratchpad.md"
  );
}

function isOpenableDocument(
  node: WorkspaceNode | undefined,
  nodes: WorkspaceNode[],
  trashId?: string | null
): node is WorkspaceNode {
  return Boolean(
    node &&
      node.kind === "document" &&
      !isInTrash(node.id, nodes, trashId)
  );
}

/**
 * Document to open when nothing is remembered: Welcome, then the seeded
 * scratchpad, then the first essay that is not in Trash.
 */
export function pickDefaultOpenDocument(
  nodes: WorkspaceNode[],
  options?: { scratchpadId?: string | null }
): string | null {
  const trashId = getTrashNode(nodes)?.id;
  const welcome = nodes.find(
    (n) =>
      n.parent_id === null &&
      n.kind === "document" &&
      n.name.toLowerCase() === "welcome.md"
  );
  if (isOpenableDocument(welcome, nodes, trashId)) return welcome.id;

  const scratchpadId = options?.scratchpadId;
  const seeded =
    (scratchpadId
      ? nodes.find((n) => n.id === scratchpadId)
      : undefined) ?? nodes.find(isScratchpad);
  if (isOpenableDocument(seeded, nodes, trashId)) return seeded.id;

  return (
    nodes.find((n) => isOpenableDocument(n, nodes, trashId))?.id ?? null
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
  options?: { includeTrash?: boolean; includeInbox?: boolean }
): WorkspaceNode[] {
  const trashId = getTrashNode(nodes)?.id;
  const inboxId = getInboxNode(nodes)?.id;
  const blocked = new Set(collectSubtreeIds(movingId, nodes));
  return nodes
    .filter((n) => {
      if (n.kind !== "folder") return false;
      if (blocked.has(n.id)) return false;
      if (!options?.includeTrash && n.id === trashId) return false;
      // Notes channels are managed from the Notes panel, not the Files tree.
      // Restore may still target Notes via includeInbox.
      if (!options?.includeInbox && n.id === inboxId) return false;
      return true;
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Channel label without .md — for terminal / Shell UI. */
export function channelDisplayName(node: WorkspaceNode): string {
  if (node.system_key === "inbox") return "Notes";
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
    parts.unshift(systemFolderDisplayName(node));
    walk = node.parent_id;
  }
  return parts.join("/") || "Workspace root";
}

/** Normalize a document filename for same-name comparisons (`Essay` → `essay.md`). */
export function documentFileKey(name: string): string {
  const base = name.trim().toLowerCase();
  if (!base) return "";
  return base.endsWith(".md") ? base : `${base}.md`;
}

/**
 * Live documents that share a file name (Trash excluded), keyed by node id.
 * Used to spot a second BlogIDE copy after a git mv / import, without
 * creating anything from GitHub.
 */
export function sameNamedDocumentTwins(
  nodes: WorkspaceNode[]
): Map<string, Array<{ nodeId: string; label: string }>> {
  const trash = getTrashNode(nodes);
  const groups = new Map<string, WorkspaceNode[]>();
  for (const node of nodes) {
    if (node.kind !== "document") continue;
    if (isInTrash(node.id, nodes, trash?.id)) continue;
    const key = documentFileKey(node.name);
    if (!key) continue;
    const list = groups.get(key) ?? [];
    list.push(node);
    groups.set(key, list);
  }
  const out = new Map<string, Array<{ nodeId: string; label: string }>>();
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    for (const node of group) {
      out.set(
        node.id,
        group
          .filter((other) => other.id !== node.id)
          .map((other) => ({
            nodeId: other.id,
            label: folderPathLabel(other.id, nodes),
          }))
      );
    }
  }
  return out;
}

export function listSameNamedDocuments(
  nodes: WorkspaceNode[],
  nodeId: string
): Array<{ nodeId: string; label: string }> {
  return sameNamedDocumentTwins(nodes).get(nodeId) ?? [];
}
