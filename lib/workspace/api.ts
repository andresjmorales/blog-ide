import { createClient } from "@/lib/supabase/client";
import {
  requestTimeoutSignal,
  SYNC_WRITE_TIMEOUT_MS,
  WORKSPACE_READ_TIMEOUT_MS,
} from "@/lib/net/timeout";
import { byteaToBytes, bytesToByteaParam } from "@/lib/vault/bytes";
import { decryptUtf8, encryptUtf8, VAULT_NAME_PLACEHOLDER } from "@/lib/vault/crypto";
import { vaultConflictKey } from "@/lib/vault/dedupe";
import { getVaultKeys, requireVaultKeys } from "@/lib/vault/session";
import type {
  ConflictResolution,
  CreateDocumentConflictCopyResult,
  DefaultWorkspaceIds,
  RemoteDocument,
  ResolveDocumentConflictResult,
  SaveDocumentResult,
  WorkspaceKind,
  WorkspaceNode,
} from "@/lib/workspace/types";

function client() {
  return createClient();
}

function readSignal(signal?: AbortSignal): AbortSignal {
  return signal ?? requestTimeoutSignal(WORKSPACE_READ_TIMEOUT_MS);
}

export async function ensureDefaultWorkspace(
  signal?: AbortSignal
): Promise<DefaultWorkspaceIds> {
  const { data, error } = await client()
    .rpc("ensure_default_workspace")
    .abortSignal(readSignal(signal));
  if (error) throw error;
  const payload = data as DefaultWorkspaceIds;
  if (!payload || typeof payload !== "object") {
    throw new Error("Workspace bootstrap returned no payload");
  }
  return payload;
}

export async function listWorkspaceNodes(
  signal?: AbortSignal
): Promise<WorkspaceNode[]> {
  const { data, error } = await client()
    .from("workspace_nodes")
    .select("*")
    .order("position", { ascending: true })
    .abortSignal(readSignal(signal));
  if (error) throw error;
  return (data ?? []) as WorkspaceNode[];
}

export async function fetchRemoteDocument(
  nodeId: string,
  signal?: AbortSignal
): Promise<RemoteDocument | null> {
  const { data, error } = await client()
    .from("documents")
    .select("*")
    .eq("node_id", nodeId)
    .abortSignal(readSignal(signal))
    .maybeSingle();
  if (error) throw error;
  return data as RemoteDocument | null;
}

export async function saveDocumentRemote(
  nodeId: string,
  markdown: string,
  baseVersion: number,
  options?: { enc?: number }
): Promise<SaveDocumentResult> {
  const enc = options?.enc ?? 0;
  let ciphertextParam: string | null = null;
  let markdownParam = markdown;
  if (enc === 1) {
    const keys = requireVaultKeys();
    const blob = await encryptUtf8(keys.dek, markdown);
    ciphertextParam = bytesToByteaParam(blob);
    markdownParam = "";
  }
  const { data, error } = await client()
    .rpc("save_document", {
      p_node_id: nodeId,
      p_markdown: markdownParam,
      p_base_version: baseVersion,
      p_ciphertext: ciphertextParam,
      p_enc: enc,
    })
    .abortSignal(requestTimeoutSignal(SYNC_WRITE_TIMEOUT_MS));
  if (error) throw error;
  return data as SaveDocumentResult;
}

export async function createDocumentConflictCopy(
  originId: string,
  baseVersion: number,
  markdown: string,
  options?: { enc?: number; displayName?: string }
): Promise<CreateDocumentConflictCopyResult> {
  const enc = options?.enc ?? 0;
  const params: Record<string, unknown> = {
    p_origin_id: originId,
    p_base_version: baseVersion,
    p_markdown: enc === 1 ? "" : markdown,
  };
  if (enc === 1) {
    const keys = requireVaultKeys();
    const blob = await encryptUtf8(keys.dek, markdown);
    const name = options?.displayName ?? "conflict.md";
    params.p_ciphertext = bytesToByteaParam(blob);
    params.p_enc = 1;
    params.p_conflict_key = await vaultConflictKey(
      keys.hmacKey,
      originId,
      baseVersion,
      markdown
    );
    params.p_name_enc = bytesToByteaParam(await encryptUtf8(keys.dek, name));
  }
  const { data, error } = await client().rpc(
    "create_document_conflict_copy",
    params
  );
  if (error) throw error;
  return data as CreateDocumentConflictCopyResult;
}

export async function resolveDocumentConflict(
  copyId: string,
  resolution: ConflictResolution,
  expectedOriginVersion?: number
): Promise<ResolveDocumentConflictResult> {
  const { data, error } = await client().rpc("resolve_document_conflict", {
    p_copy_id: copyId,
    p_resolution: resolution,
    p_expected_origin_version: expectedOriginVersion ?? null,
  });
  if (error) throw error;
  return data as ResolveDocumentConflictResult;
}

export async function createWorkspaceNode(input: {
  kind: WorkspaceKind;
  name: string;
  parentId?: string | null;
  markdown?: string;
  url?: string | null;
  encrypt?: boolean;
}): Promise<string> {
  const params: Record<string, unknown> = {
    p_kind: input.kind,
    p_name: input.name,
    p_parent_id: input.parentId ?? null,
    p_markdown: input.markdown ?? "",
    p_url: input.url ?? null,
  };
  if (input.encrypt) {
    const keys = requireVaultKeys();
    params.p_name = VAULT_NAME_PLACEHOLDER;
    params.p_name_enc = bytesToByteaParam(await encryptUtf8(keys.dek, input.name));
    if (input.url) {
      params.p_url = null;
      params.p_url_enc = bytesToByteaParam(await encryptUtf8(keys.dek, input.url));
    }
    if (input.kind === "document") {
      const blob = await encryptUtf8(keys.dek, input.markdown ?? "");
      params.p_markdown = "";
      params.p_ciphertext = bytesToByteaParam(blob);
      params.p_enc = 1;
    }
  }
  const { data, error } = await client().rpc("create_workspace_node", params);
  if (error) throw error;
  return String(data);
}

export async function getWorkspaceNode(
  nodeId: string
): Promise<WorkspaceNode | null> {
  const { data, error } = await client()
    .from("workspace_nodes")
    .select("*")
    .eq("id", nodeId)
    .maybeSingle();
  if (error) throw error;
  return data as WorkspaceNode | null;
}

export async function moveWorkspaceNode(
  nodeId: string,
  parentId: string | null
): Promise<void> {
  const { error } = await client().rpc("move_workspace_node", {
    p_node_id: nodeId,
    p_parent_id: parentId,
  });
  if (error) throw error;
}

export async function deleteWorkspaceNode(nodeId: string): Promise<void> {
  const { error } = await client().rpc("delete_workspace_node", {
    p_node_id: nodeId,
  });
  if (error) throw error;
}

/** All document bodies for the current user in one round trip (export). */
export async function listAllDocumentBodies(): Promise<Map<string, string>> {
  const { data, error } = await client()
    .from("documents")
    .select("node_id, markdown, enc, ciphertext");
  if (error) throw error;
  const map = new Map<string, string>();
  const keys = getVaultKeys();
  for (const row of (data ?? []) as {
    node_id: string;
    markdown: string;
    enc?: number;
    ciphertext?: string | null;
  }[]) {
    if (row.enc === 1) {
      if (!keys) continue;
      const blob = byteaToBytes(row.ciphertext);
      if (!blob) continue;
      try {
        map.set(row.node_id, await decryptUtf8(keys.dek, blob));
      } catch {
        // skip undecryptable rows
      }
      continue;
    }
    map.set(row.node_id, row.markdown);
  }
  return map;
}

export type DocumentRevision = {
  node_id: string;
  version: number;
  created_at: string;
  markdown: string;
  enc?: number;
};

/** Server-side snapshots of the last 20 saved versions (newest first). */
export async function listDocumentRevisions(
  nodeId: string
): Promise<DocumentRevision[]> {
  const { data, error } = await client()
    .from("document_revisions")
    .select("node_id, version, created_at, markdown, enc, ciphertext")
    .eq("node_id", nodeId)
    .order("version", { ascending: false });
  if (error) throw error;
  const keys = getVaultKeys();
  const out: DocumentRevision[] = [];
  for (const row of (data ?? []) as {
    node_id: string;
    version: number;
    created_at: string;
    markdown: string;
    enc?: number;
    ciphertext?: string | null;
  }[]) {
    if (row.enc === 1) {
      if (!keys) continue;
      const blob = byteaToBytes(row.ciphertext);
      if (!blob) continue;
      try {
        out.push({
          node_id: row.node_id,
          version: row.version,
          created_at: row.created_at,
          markdown: await decryptUtf8(keys.dek, blob),
          enc: 1,
        });
      } catch {
        continue;
      }
    } else {
      out.push({
        node_id: row.node_id,
        version: row.version,
        created_at: row.created_at,
        markdown: row.markdown,
        enc: 0,
      });
    }
  }
  return out;
}

/**
 * Replace the current document with an older snapshot. Runs through
 * save_document server-side, so the replaced content is itself snapshotted.
 */
export async function restoreDocumentRevision(
  nodeId: string,
  version: number
): Promise<SaveDocumentResult> {
  const { data, error } = await client().rpc("restore_document_revision", {
    p_node_id: nodeId,
    p_version: version,
  });
  if (error) throw error;
  return data as SaveDocumentResult;
}

export async function renameWorkspaceNode(
  nodeId: string,
  name: string
): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Name is required");
  const { error } = await client()
    .from("workspace_nodes")
    .update({ name: trimmed, updated_at: new Date().toISOString() })
    .eq("id", nodeId);
  if (error) throw error;
}

/** Pin/unpin a node — pinned siblings sort to the top of the Files panel. */
export async function setWorkspaceNodePinned(
  nodeId: string,
  pinned: boolean
): Promise<void> {
  const { error } = await client()
    .from("workspace_nodes")
    .update({ pinned, updated_at: new Date().toISOString() })
    .eq("id", nodeId);
  if (error) throw error;
}

/** Set or clear an explorer accent color for a node. */
export async function setWorkspaceNodeColor(
  nodeId: string,
  color: string | null
): Promise<void> {
  const { error } = await client()
    .from("workspace_nodes")
    .update({ color, updated_at: new Date().toISOString() })
    .eq("id", nodeId);
  if (error) {
    throw new Error(error.message || "Could not update color.");
  }
}
