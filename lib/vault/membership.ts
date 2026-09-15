import {
  collectSubtreeIds,
  getTrashNode,
} from "@/lib/workspace/tree";
import type { WorkspaceNode } from "@/lib/workspace/types";

export function getVaultNode(
  nodes: WorkspaceNode[]
): WorkspaceNode | undefined {
  return nodes.find((n) => n.system_key === "vault");
}

export function isVaultFolder(node: WorkspaceNode): boolean {
  return node.system_key === "vault";
}

/** True if node is the vault folder or nested under it. */
export function isInVault(
  nodeId: string,
  nodes: WorkspaceNode[],
  vaultId?: string | null
): boolean {
  const vault = vaultId ?? getVaultNode(nodes)?.id;
  if (!vault) return false;
  if (nodeId === vault) return true;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  let walk: string | null | undefined = nodeId;
  while (walk) {
    if (walk === vault) return true;
    walk = byId.get(walk)?.parent_id ?? null;
  }
  return false;
}

export function vaultSubtreeIds(
  nodes: WorkspaceNode[],
  vaultId?: string | null
): Set<string> {
  const vault = vaultId ?? getVaultNode(nodes)?.id;
  if (!vault) return new Set();
  return new Set(collectSubtreeIds(vault, nodes));
}

export function crossesVaultBoundary(
  nodeId: string,
  targetParentId: string | null,
  nodes: WorkspaceNode[]
): boolean {
  const vaultId = getVaultNode(nodes)?.id ?? null;
  if (!vaultId) return false;
  const from = isInVault(nodeId, nodes, vaultId);
  const to =
    targetParentId != null &&
    isInVault(targetParentId, nodes, vaultId);
  return from !== to;
}

export function nodeLooksEncrypted(node: WorkspaceNode): boolean {
  return Boolean(node.name_enc);
}

export function vaultDisplayName(
  node: WorkspaceNode,
  names: Map<string, string>
): string {
  if (node.system_key === "vault") return "Vault";
  return names.get(node.id) ?? node.name;
}

export function trashIdOf(nodes: WorkspaceNode[]): string | null {
  return getTrashNode(nodes)?.id ?? null;
}
