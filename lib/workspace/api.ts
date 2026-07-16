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
