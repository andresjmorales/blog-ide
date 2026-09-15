import { overlayVaultName } from "@/lib/vault/names";
import type { WorkspaceNode } from "@/lib/workspace/types";

/** Filename stem: hide the .md extension; storage still uses it. */
export function fileStem(node: WorkspaceNode): string {
  if (node.kind === "document") {
    return node.name.replace(/\.md$/i, "");
  }
  return node.name;
}

/**
 * Files-tab label. Vault ciphertext names overlay the placeholder when
 * unlocked; titles come from decrypted frontmatter the same way as other
 * essays. Locked vault rows keep the placeholder (no title, no .md).
 */
export function explorerDisplayName(
  node: WorkspaceNode,
  docTitles?: Map<string, string>,
  vaultNames?: Map<string, string>
): string {
  if (node.system_key === "vault") return "Vault";
  const named = vaultNames?.has(node.id)
    ? { ...node, name: overlayVaultName(node, vaultNames) }
    : node;
  if (named.kind === "document" && docTitles) {
    const title = docTitles.get(named.id)?.trim();
    const stem = fileStem(named);
    if (title && title !== stem) return title;
  }
  return fileStem(named);
}
