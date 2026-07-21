import { createClient } from "@/lib/supabase/client";
import type {
  DefaultWorkspaceIds,
  RemoteDocument,
  SaveDocumentResult,
  WorkspaceKind,
  WorkspaceNode,
} from "@/lib/workspace/types";

function client() {
  return createClient();
}

export async function ensureDefaultWorkspace(): Promise<DefaultWorkspaceIds> {
  const { data, error } = await client().rpc("ensure_default_workspace");
  if (error) throw error;
  const payload = data as DefaultWorkspaceIds;
  if (!payload?.scratchpadId) {
    throw new Error("Workspace bootstrap returned no scratchpad");
  }
  return payload;
}

export async function listWorkspaceNodes(): Promise<WorkspaceNode[]> {
  const { data, error } = await client()
    .from("workspace_nodes")
    .select("*")
    .order("position", { ascending: true });
  if (error) throw error;
  return (data ?? []) as WorkspaceNode[];
}

export async function fetchRemoteDocument(
  nodeId: string
): Promise<RemoteDocument | null> {
  const { data, error } = await client()
    .from("documents")
    .select("*")
    .eq("node_id", nodeId)
    .maybeSingle();
  if (error) throw error;
  return data as RemoteDocument | null;
}

export async function saveDocumentRemote(
  nodeId: string,
  markdown: string,
  baseVersion: number
): Promise<SaveDocumentResult> {
  const { data, error } = await client().rpc("save_document", {
    p_node_id: nodeId,
    p_markdown: markdown,
    p_base_version: baseVersion,
  });
  if (error) throw error;
  return data as SaveDocumentResult;
}

export async function createWorkspaceNode(input: {
  kind: WorkspaceKind;
  name: string;
  parentId?: string | null;
  markdown?: string;
  url?: string | null;
}): Promise<string> {
  const { data, error } = await client().rpc("create_workspace_node", {
    p_kind: input.kind,
    p_name: input.name,
    p_parent_id: input.parentId ?? null,
    p_markdown: input.markdown ?? "",
    p_url: input.url ?? null,
  });
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
    .select("node_id, markdown");
  if (error) throw error;
  const map = new Map<string, string>();
  for (const row of (data ?? []) as { node_id: string; markdown: string }[]) {
    map.set(row.node_id, row.markdown);
  }
  return map;
}

export type DocumentRevision = {
  node_id: string;
  version: number;
  created_at: string;
  markdown: string;
};

/** Server-side snapshots of the last 20 saved versions (newest first). */
export async function listDocumentRevisions(
  nodeId: string
): Promise<DocumentRevision[]> {
  const { data, error } = await client()
    .from("document_revisions")
    .select("node_id, version, created_at, markdown")
    .eq("node_id", nodeId)
    .order("version", { ascending: false });
  if (error) throw error;
  return (data ?? []) as DocumentRevision[];
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
