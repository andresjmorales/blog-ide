"use client";

import { useSyncExternalStore } from "react";
import type { CommentAnchor } from "@/lib/comments/anchors";
import {
  addDocumentComment,
  deleteComment,
  editComment,
  fetchCommentParticipants,
  listDocumentComments,
  replyToComment,
  setThreadStatus,
  type CommentParticipant,
} from "@/lib/comments/api";
import {
  commentFailureMessage,
  type CommentAccess,
  type CommentThread,
  type ThreadPlacement,
} from "@/lib/comments/types";

/**
 * One comment session per page: the essay open in the owner's editor, or
 * the shared essay an invitee is reading. The editor side (highlights,
 * anchors) and the rail read and write the same state here, so the rail
 * can live in the dock system away from the editor tree.
 */

export type CommentDraft = {
  anchor: CommentAnchor;
};

export type CommentSession = {
  nodeId: string | null;
  status: "idle" | "loading" | "ready" | "error";
  error: string | null;
  access: CommentAccess | null;
  me: string | null;
  threads: CommentThread[];
  placements: Record<string, ThreadPlacement>;
  participants: Record<string, CommentParticipant>;
  activeThreadId: string | null;
  /** Bumped when the rail asks the editor to reveal the active thread. */
  revealNonce: number;
  draft: CommentDraft | null;
  loadedAt: number;
};

const EMPTY: CommentSession = {
  nodeId: null,
  status: "idle",
  error: null,
  access: null,
  me: null,
  threads: [],
  placements: {},
  participants: {},
  activeThreadId: null,
  revealNonce: 0,
  draft: null,
  loadedAt: 0,
};

let state: CommentSession = EMPTY;
const listeners = new Set<() => void>();
let loadSeq = 0;

function set(patch: Partial<CommentSession>): void {
  state = { ...state, ...patch };
  for (const listener of listeners) listener();
}

export function getCommentSession(): CommentSession {
  return state;
}

export function subscribeCommentSession(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useCommentSession(): CommentSession {
  return useSyncExternalStore(
    subscribeCommentSession,
    getCommentSession,
    () => EMPTY
  );
}

/** Test helper. */
export function resetCommentSession(): void {
  loadSeq += 1;
  state = EMPTY;
  for (const listener of listeners) listener();
}

export function clearCommentSession(): void {
  if (state.nodeId == null && state.status === "idle") return;
  resetCommentSession();
}

async function loadParticipants(nodeId: string, seq: number) {
  try {
    const people = await fetchCommentParticipants(nodeId);
    if (seq !== loadSeq) return;
    const byId: Record<string, CommentParticipant> = {};
    for (const person of people) byId[person.id] = person;
    set({ participants: byId });
  } catch {
    // Names come with the comments; photos are optional.
  }
}

/**
 * Load (or reload) threads for `nodeId`. Switching essays clears the old
 * session first so highlights never paint on the wrong text.
 */
export async function loadComments(nodeId: string): Promise<void> {
  const seq = ++loadSeq;
  const switching = state.nodeId !== nodeId;
  if (switching) {
    state = { ...EMPTY, nodeId, status: "loading" };
    for (const listener of listeners) listener();
  }
  try {
    const listing = await listDocumentComments(nodeId);
    if (seq !== loadSeq) return;
    if (!listing.ok) {
      set({
        status: "error",
        error: commentFailureMessage(listing.reason),
        access: null,
        threads: [],
      });
      return;
    }
    const ids = new Set(listing.threads.map((t) => t.id));
    const hadAuthors = new Set(
      state.threads.flatMap((t) => [t.root.author_id, ...t.replies.map((r) => r.author_id)])
    );
    const newAuthor = listing.threads.some(
      (t) =>
        !hadAuthors.has(t.root.author_id) ||
        t.replies.some((r) => !hadAuthors.has(r.author_id))
    );
    set({
      status: "ready",
      error: null,
      access: listing.access,
      me: listing.me,
      threads: listing.threads,
      activeThreadId:
        state.activeThreadId && ids.has(state.activeThreadId)
          ? state.activeThreadId
          : null,
      loadedAt: Date.now(),
    });
    if (switching || newAuthor) void loadParticipants(nodeId, seq);
  } catch {
    if (seq !== loadSeq) return;
    // Keep what we had (offline, flaky network); only surface the error.
    set({
      status: state.threads.length > 0 ? "ready" : "error",
      error: "Could not load comments. Check your connection.",
    });
  }
}

export function refreshComments(): Promise<void> {
  return state.nodeId ? loadComments(state.nodeId) : Promise.resolve();
}

export function setActiveThread(threadId: string | null, reveal = false): void {
  if (state.activeThreadId === threadId && !reveal) return;
  set({
    activeThreadId: threadId,
    revealNonce: reveal ? state.revealNonce + 1 : state.revealNonce,
  });
}

export function setThreadPlacements(
  placements: Record<string, ThreadPlacement>
): void {
  if (placementsEqual(state.placements, placements)) return;
  set({ placements });
}

/** Merge placements for one scope (e.g. an open footnote card). */
export function mergeThreadPlacements(
  patch: Record<string, ThreadPlacement>
): void {
  const next = { ...state.placements, ...patch };
  setThreadPlacements(next);
}

function placementsEqual(
  a: Record<string, ThreadPlacement>,
  b: Record<string, ThreadPlacement>
): boolean {
  const ak = Object.keys(a);
  if (ak.length !== Object.keys(b).length) return false;
  for (const key of ak) {
    const x = a[key];
    const y = b[key];
    if (
      !y ||
      x.detached !== y.detached ||
      x.order !== y.order ||
      x.subOrder !== y.subOrder ||
      x.footnoteNumber !== y.footnoteNumber
    ) {
      return false;
    }
  }
  return true;
}

export function startCommentDraft(anchor: CommentAnchor): void {
  set({ draft: { anchor }, activeThreadId: null });
}

export function cancelCommentDraft(): void {
  if (state.draft) set({ draft: null });
}

type Outcome = { ok: true } | { ok: false; message: string };

async function run(
  action: () => Promise<{ ok: boolean; reason?: string }>
): Promise<Outcome & { result?: Record<string, unknown> }> {
  try {
    const result = await action();
    if (!result.ok) {
      return { ok: false, message: commentFailureMessage(result.reason) };
    }
    await refreshComments();
    return { ok: true, result };
  } catch {
    return { ok: false, message: "Could not reach BlogIDE. Try again." };
  }
}

export async function submitDraft(body: string): Promise<Outcome> {
  const { nodeId, draft } = state;
  if (!nodeId || !draft) return { ok: false, message: "Select text first." };
  const outcome = await run(() => addDocumentComment(nodeId, draft.anchor, body));
  if (outcome.ok) {
    const id = typeof outcome.result?.id === "string" ? outcome.result.id : null;
    set({ draft: null, activeThreadId: id });
  }
  return outcome.ok ? { ok: true } : outcome;
}

export async function submitReply(threadId: string, body: string): Promise<Outcome> {
  return run(() => replyToComment(threadId, body));
}

export async function submitEdit(commentId: string, body: string): Promise<Outcome> {
  return run(() => editComment(commentId, body));
}

export async function submitDelete(commentId: string): Promise<Outcome> {
  return run(() => deleteComment(commentId));
}

export async function submitThreadStatus(
  threadId: string,
  status: "open" | "resolved"
): Promise<Outcome> {
  return run(() => setThreadStatus(threadId, status));
}
