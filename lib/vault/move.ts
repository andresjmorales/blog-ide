import {
  beginUploadStatus,
  updateUploadStatus,
} from "@/lib/assets/uploadStatus";
import { getLocalDoc, putLocalDoc } from "@/lib/db/indexed";
import { byteaToBytes } from "@/lib/vault/bytes";
import { decryptUtf8, encryptUtf8, VAULT_NAME_PLACEHOLDER } from "@/lib/vault/crypto";
import {
  purgeDocumentRevisions,
  setWorkspaceNodeEnc,
} from "@/lib/vault/api";
import {
  getVaultNode,
  isInVault,
} from "@/lib/vault/membership";
import { classifyVaultDrift, repairForDrift } from "@/lib/vault/reconcile";
import { requireVaultKeys, VaultLockedError } from "@/lib/vault/session";
import {
  fetchRemoteDocument,
  moveWorkspaceNode,
  saveDocumentRemote,
} from "@/lib/workspace/api";
import { collectSubtreeIds, isInTrash } from "@/lib/workspace/tree";
import type { WorkspaceNode } from "@/lib/workspace/types";

export async function readDocumentPlaintext(nodeId: string): Promise<{
  markdown: string;
  baseVersion: number;
}> {
  const local = await getLocalDoc(nodeId);
  if (local?.dirty) {
    return { markdown: local.markdown, baseVersion: local.baseVersion };
  }
  const remote = await fetchRemoteDocument(nodeId);
  if (remote?.enc === 1) {
    const keys = requireVaultKeys();
    const blob = byteaToBytes(remote.ciphertext);
    if (!blob) throw new Error("Missing ciphertext.");
    return {
      markdown: await decryptUtf8(keys.dek, blob),
      baseVersion: Number(remote.version),
    };
  }
  if (remote) {
    return {
      markdown: remote.markdown,
      baseVersion: Number(remote.version),
    };
  }
  if (local) {
    return { markdown: local.markdown, baseVersion: local.baseVersion };
  }
  throw new Error("Document not found.");
}

async function cachePlaintext(
  nodeId: string,
  markdown: string,
  baseVersion: number
): Promise<void> {
  await putLocalDoc({
    nodeId,
    markdown,
    updatedAt: new Date().toISOString(),
    dirty: false,
    baseVersion,
  });
}

async function encryptAndSaveDocument(
  nodeId: string,
  markdown: string,
  baseVersion: number
): Promise<number> {
  const result = await saveDocumentRemote(nodeId, markdown, baseVersion, {
    enc: 1,
  });
  if (!result.ok) {
    throw new Error(
      result.reason === "conflict"
        ? "This essay changed elsewhere. Resolve the conflict, then try again."
        : result.reason === "quota"
          ? "Storage quota exceeded."
          : `Could not save (${result.reason}).`
    );
  }
  await purgeDocumentRevisions(nodeId);
  return result.version;
}

async function decryptAndSaveDocument(
  nodeId: string,
  markdown: string,
  baseVersion: number
): Promise<number> {
  const result = await saveDocumentRemote(nodeId, markdown, baseVersion, {
    enc: 0,
  });
  if (!result.ok) {
    throw new Error(
      result.reason === "quota"
        ? "Storage quota exceeded."
        : `Could not save (${result.reason}).`
    );
  }
  await purgeDocumentRevisions(nodeId);
  return result.version;
}

export async function renameVaultDisplay(
  node: WorkspaceNode,
  displayName: string,
  displayUrl: string | null = node.url
): Promise<void> {
  await writeEncryptedName(node, displayName, displayUrl);
}

async function writeEncryptedName(
  node: WorkspaceNode,
  displayName: string,
  displayUrl: string | null
): Promise<void> {
  const keys = requireVaultKeys();
  const nameEnc = await encryptUtf8(keys.dek, displayName);
  const urlEnc =
    node.kind === "link" && displayUrl
      ? await encryptUtf8(keys.dek, displayUrl)
      : null;
  await setWorkspaceNodeEnc({
    nodeId: node.id,
    name: VAULT_NAME_PLACEHOLDER,
    nameEnc,
    url: null,
    urlEnc,
  });
}

function postOrder(rootId: string, nodes: WorkspaceNode[]): WorkspaceNode[] {
  const byParent = new Map<string | null, WorkspaceNode[]>();
  for (const node of nodes) {
    const list = byParent.get(node.parent_id) ?? [];
    list.push(node);
    byParent.set(node.parent_id, list);
  }
  const out: WorkspaceNode[] = [];
  const walk = (id: string) => {
    for (const child of byParent.get(id) ?? []) walk(child.id);
    const self = nodes.find((n) => n.id === id);
    if (self) out.push(self);
  };
  walk(rootId);
  return out;
}

async function encryptNodeForVault(
  node: WorkspaceNode,
  names: Map<string, string>
): Promise<void> {
  const displayName = names.get(node.id) ?? node.name;
  const displayUrl = node.url;
  if (node.kind === "document") {
    const local = await getLocalDoc(node.id);
    if (local?.dirty) {
      throw new Error(`Save “${displayName}” before moving it into the vault.`);
    }
    const { markdown, baseVersion } = await readDocumentPlaintext(node.id);
    const version = await encryptAndSaveDocument(node.id, markdown, baseVersion);
    await cachePlaintext(node.id, markdown, version);
  }
  await writeEncryptedName(node, displayName, displayUrl);
}

async function decryptNodeFromVault(
  node: WorkspaceNode,
  names: Map<string, string>,
  urls: Map<string, string>
): Promise<void> {
  const displayName = names.get(node.id) ?? node.name;
  const displayUrl = urls.get(node.id) ?? node.url;
  if (node.kind === "document") {
    const local = await getLocalDoc(node.id);
    if (local?.dirty) {
      throw new Error(`Save “${displayName}” before moving it out of the vault.`);
    }
    const { markdown, baseVersion } = await readDocumentPlaintext(node.id);
    const version = await decryptAndSaveDocument(node.id, markdown, baseVersion);
    await cachePlaintext(node.id, markdown, version);
  }
  await setWorkspaceNodeEnc({
    nodeId: node.id,
    name: displayName,
    nameEnc: null,
    url: displayUrl,
    urlEnc: null,
  });
}

export async function moveSubtreeToVault(input: {
  nodeId: string;
  nodes: WorkspaceNode[];
  names: Map<string, string>;
  targetParentId?: string | null;
}): Promise<void> {
  if (!requireVaultKeys()) throw new VaultLockedError();
  const vault = getVaultNode(input.nodes);
  if (!vault) throw new Error("Create a vault first.");
  const target = input.targetParentId ?? vault.id;
  const order = postOrder(input.nodeId, input.nodes);
  const statusId = beginUploadStatus(
    "uploading",
    `Moving ${order.length} item${order.length === 1 ? "" : "s"} into the vault…`
  );
  let done = 0;
  try {
    for (const node of order) {
      await encryptNodeForVault(node, input.names);
      done += 1;
      updateUploadStatus(statusId, {
        phase: "uploading",
        progress: Math.round((100 * done) / order.length),
        message: `Moving into the vault… ${done}/${order.length}`,
      });
    }
    const root = input.nodes.find((n) => n.id === input.nodeId);
    if (root && root.parent_id !== target) {
      await moveWorkspaceNode(input.nodeId, target);
    }
    updateUploadStatus(statusId, {
      phase: "done",
      progress: 100,
      message: "Moved into the vault. Version history for those essays starts here.",
    });
  } catch (error) {
    updateUploadStatus(statusId, {
      phase: "error",
      message: error instanceof Error ? error.message : "Could not move into the vault.",
    });
    throw error;
  }
}

export async function moveSubtreeOutOfVault(input: {
  nodeId: string;
  nodes: WorkspaceNode[];
  names: Map<string, string>;
  urls: Map<string, string>;
  targetParentId: string | null;
}): Promise<void> {
  if (!requireVaultKeys()) throw new VaultLockedError();
  const order = postOrder(input.nodeId, input.nodes);
  const statusId = beginUploadStatus(
    "uploading",
    `Moving ${order.length} item${order.length === 1 ? "" : "s"} out of the vault…`
  );
  let done = 0;
  try {
    for (const node of order) {
      await decryptNodeFromVault(node, input.names, input.urls);
      done += 1;
      updateUploadStatus(statusId, {
        phase: "uploading",
        progress: Math.round((100 * done) / order.length),
        message: `Moving out of the vault… ${done}/${order.length}`,
      });
    }
    const root = input.nodes.find((n) => n.id === input.nodeId);
    if (root && root.parent_id !== input.targetParentId) {
      await moveWorkspaceNode(input.nodeId, input.targetParentId);
    }
    updateUploadStatus(statusId, {
      phase: "done",
      progress: 100,
      message: "Moved out of the vault. Those essays are stored as plaintext again.",
    });
  } catch (error) {
    updateUploadStatus(statusId, {
      phase: "error",
      message: error instanceof Error ? error.message : "Could not move out of the vault.",
    });
    throw error;
  }
}

export async function encryptDocumentInPlace(node: WorkspaceNode): Promise<void> {
  const local = await getLocalDoc(node.id);
  if (local?.dirty) {
    throw new Error("Save this essay before the vault can encrypt it.");
  }
  const { markdown, baseVersion } = await readDocumentPlaintext(node.id);
  const version = await encryptAndSaveDocument(node.id, markdown, baseVersion);
  await cachePlaintext(node.id, markdown, version);
  await writeEncryptedName(node, node.name, node.url);
}

export async function reconcileVault(
  nodes: WorkspaceNode[],
  names: Map<string, string>
): Promise<string[]> {
  const vault = getVaultNode(nodes);
  if (!vault) return [];
  requireVaultKeys();
  const messages: string[] = [];
  const vaultIds = new Set(collectSubtreeIds(vault.id, nodes));

  for (const node of nodes) {
    if (node.kind !== "document") continue;
    if (node.system_key) continue;
    const remote = await fetchRemoteDocument(node.id);
    const enc = remote?.enc === 1 ? 1 : 0;
    const kind = classifyVaultDrift({
      inVault: vaultIds.has(node.id) && node.id !== vault.id,
      inTrash: isInTrash(node.id, nodes),
      enc,
    });
    const repair = repairForDrift(kind);
    const label = names.get(node.id) ?? node.name;
    if (repair === "encrypt_now") {
      await encryptDocumentInPlace({ ...node, name: label });
      messages.push(`Encrypted “${label}”.`);
    } else if (repair === "finish_move_in") {
      const { markdown, baseVersion } = await readDocumentPlaintext(node.id);
      if (enc !== 1) {
        const version = await encryptAndSaveDocument(
          node.id,
          markdown,
          baseVersion
        );
        await cachePlaintext(node.id, markdown, version);
      } else {
        await purgeDocumentRevisions(node.id);
        await cachePlaintext(node.id, markdown, baseVersion);
      }
      if (!isInVault(node.id, nodes, vault.id)) {
        await moveWorkspaceNode(node.id, vault.id);
      }
      await writeEncryptedName(node, label, node.url);
      messages.push(`Finished moving “${label}” into the vault.`);
    }
  }

  for (const node of nodes) {
    if (node.kind === "document") continue;
    if (node.id === vault.id) continue;
    if (!vaultIds.has(node.id)) continue;
    if (node.name_enc) continue;
    const label = names.get(node.id) ?? node.name;
    await writeEncryptedName(node, label, node.url);
    messages.push(`Encrypted the name of “${label}”.`);
  }

  return messages;
}
