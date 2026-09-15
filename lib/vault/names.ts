import { byteaToBytes } from "@/lib/vault/bytes";
import { decryptUtf8 } from "@/lib/vault/crypto";
import type { WorkspaceNode } from "@/lib/workspace/types";

export async function decryptTreeNames(
  nodes: WorkspaceNode[],
  dek: CryptoKey
): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  for (const node of nodes) {
    const blob = byteaToBytes(node.name_enc);
    if (!blob) continue;
    try {
      names.set(node.id, await decryptUtf8(dek, blob));
    } catch {
      // leave placeholder
    }
  }
  return names;
}

export async function decryptTreeUrls(
  nodes: WorkspaceNode[],
  dek: CryptoKey
): Promise<Map<string, string>> {
  const urls = new Map<string, string>();
  for (const node of nodes) {
    const blob = byteaToBytes(node.url_enc);
    if (!blob) continue;
    try {
      urls.set(node.id, await decryptUtf8(dek, blob));
    } catch {
      // leave empty
    }
  }
  return urls;
}

export function overlayVaultName(
  node: WorkspaceNode,
  names: Map<string, string>
): string {
  if (node.system_key === "vault") return "Vault";
  return names.get(node.id) ?? node.name;
}

/** Clone the tree with decrypted vault names (GitHub paths, uniqueness, zip). */
export function nodesWithDisplayNames(
  nodes: WorkspaceNode[],
  names: Map<string, string>
): WorkspaceNode[] {
  if (names.size === 0) return nodes;
  return nodes.map((node) => {
    const display = names.get(node.id);
    return display ? { ...node, name: display } : node;
  });
}
