import { createClient } from "@/lib/supabase/client";
import type { CommentAnchor } from "@/lib/comments/anchors";
import {
  groupThreads,
  type CommentAccess,
  type CommentRow,
  type CommentThread,
} from "@/lib/comments/types";

type RpcResult = { ok: boolean; reason?: string } & Record<string, unknown>;

async function rpc(name: string, args: Record<string, unknown>): Promise<RpcResult> {
  const { data, error } = await createClient().rpc(name, args);
  if (error) throw error;
  return data as RpcResult;
}

export type CommentListing =
  | { ok: true; access: CommentAccess; me: string; threads: CommentThread[] }
  | { ok: false; reason: string };

export async function listDocumentComments(nodeId: string): Promise<CommentListing> {
  const data = await rpc("list_document_comments", { p_node_id: nodeId });
  if (!data.ok) return { ok: false, reason: data.reason ?? "not_found" };
  return {
    ok: true,
    access: data.access as CommentAccess,
    me: String(data.me),
    threads: groupThreads((data.comments ?? []) as CommentRow[]),
  };
}

export function addDocumentComment(
  nodeId: string,
  anchor: CommentAnchor,
  body: string
): Promise<RpcResult> {
  return rpc("add_document_comment", {
    p_node_id: nodeId,
    p_anchor: anchor,
    p_body: body,
  });
}

export function replyToComment(threadId: string, body: string): Promise<RpcResult> {
  return rpc("reply_to_comment", { p_thread_id: threadId, p_body: body });
}

export function editComment(commentId: string, body: string): Promise<RpcResult> {
  return rpc("edit_comment", { p_comment_id: commentId, p_body: body });
}

export function deleteComment(commentId: string): Promise<RpcResult> {
  return rpc("delete_comment", { p_comment_id: commentId });
}

export function setThreadStatus(
  threadId: string,
  status: "open" | "resolved"
): Promise<RpcResult> {
  return rpc("set_thread_status", { p_thread_id: threadId, p_status: status });
}

export type CommentParticipant = {
  id: string;
  name: string | null;
  avatarUrl: string | null;
};

/** Names + short-lived photo URLs for people on this essay. */
export async function fetchCommentParticipants(
  nodeId: string
): Promise<CommentParticipant[]> {
  const res = await fetch(
    `/api/comments/participants?node=${encodeURIComponent(nodeId)}`,
    { cache: "no-store" }
  );
  if (!res.ok) return [];
  const data = (await res.json()) as { participants?: CommentParticipant[] };
  return data.participants ?? [];
}
