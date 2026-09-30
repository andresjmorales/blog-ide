import { createClient } from "@/lib/supabase/client";
import {
  isShareRole,
  type DocumentShare,
  type ShareRole,
  type SharedWithMe,
} from "@/lib/sharing/types";

type RpcResult = { ok: boolean; reason?: string } & Record<string, unknown>;

function client() {
  return createClient();
}

/** Everyone the signed-in owner has shared this essay with. */
export async function listDocumentShares(
  nodeId: string
): Promise<DocumentShare[]> {
  const { data, error } = await client()
    .from("document_shares")
    .select(
      "id, node_id, grantee_email, grantee_id, role, token, created_at, updated_at, last_opened_at"
    )
    .eq("node_id", nodeId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return ((data ?? []) as DocumentShare[]).filter((row) =>
    isShareRole(row.role)
  );
}

/** Add someone, or change their role if they already have access. */
export async function shareDocument(
  nodeId: string,
  email: string,
  role: ShareRole
): Promise<RpcResult & { id?: string; token?: string }> {
  const { data, error } = await client().rpc("share_document", {
    p_node_id: nodeId,
    p_email: email,
    p_role: role,
  });
  if (error) throw error;
  return data as RpcResult;
}

export async function updateDocumentShare(
  shareId: string,
  role: ShareRole
): Promise<RpcResult> {
  const { data, error } = await client().rpc("update_document_share", {
    p_share_id: shareId,
    p_role: role,
  });
  if (error) throw error;
  return data as RpcResult;
}

export async function revokeDocumentShare(shareId: string): Promise<RpcResult> {
  const { data, error } = await client().rpc("revoke_document_share", {
    p_share_id: shareId,
  });
  if (error) throw error;
  return data as RpcResult;
}

/** New token; the old link stops working and the share can be re-claimed. */
export async function resetDocumentShareLink(
  shareId: string
): Promise<RpcResult & { token?: string }> {
  const { data, error } = await client().rpc("reset_document_share_link", {
    p_share_id: shareId,
  });
  if (error) throw error;
  return data as RpcResult;
}

export async function listSharedWithMe(): Promise<SharedWithMe[]> {
  const { data, error } = await client().rpc("list_shared_with_me");
  if (error) throw error;
  return ((data ?? []) as SharedWithMe[]).filter((row) =>
    isShareRole(row.role)
  );
}

/** True when this instance sends invites itself (Resend configured). */
export async function fetchInviteEmailEnabled(): Promise<boolean> {
  try {
    const res = await fetch("/api/share/invite", { cache: "no-store" });
    if (!res.ok) return false;
    const data = (await res.json()) as { enabled?: boolean };
    return data.enabled === true;
  } catch {
    return false;
  }
}

export async function sendShareInvite(shareId: string): Promise<void> {
  const res = await fetch("/api/share/invite", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ shareId }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error ?? "Could not send the invite.");
  }
}
