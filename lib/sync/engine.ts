import {
  adoptRemoteDoc,
  dequeueSync,
  getLocalDoc,
  listSyncQueue,
  putLocalDoc,
  settleSyncedDoc,
  stageLocalEdit,
  type LocalDoc,
} from "@/lib/db/indexed";
import { releaseRemovedEssayImages } from "@/lib/assets/quota";
import { normalize } from "@/lib/markdown/pipeline";
import {
  createWorkspaceNode,
  fetchRemoteDocument,
  getWorkspaceNode,
  saveDocumentRemote,
} from "@/lib/workspace/api";

export type SyncStatus = {
  /** Document the status bar is describing (editor focus). */
  focusNodeId: string | null;
  localSavedAt: string | null;
  syncedAt: string | null;
  dirty: boolean;
  syncing: boolean;
  error: string | null;
  conflictCopyId: string | null;
  message: string | null;
};

type NodeSyncSlice = {
  localSavedAt: string | null;
  syncedAt: string | null;
  dirty: boolean;
  syncing: boolean;
  error: string | null;
  conflictCopyId: string | null;
  message: string | null;
};

type StatusListener = (status: SyncStatus) => void;

const listeners = new Set<StatusListener>();
/** One in-flight sync per document — overlapping flushes caused false conflicts. */
const inflight = new Map<string, Promise<void>>();
/** Per-document sync fields so inbox/pop-out opens don't clobber the badge. */
const byNode = new Map<string, NodeSyncSlice>();

let focusNodeId: string | null = null;

const emptySlice = (): NodeSyncSlice => ({
  localSavedAt: null,
  syncedAt: null,
  dirty: false,
  syncing: false,
  error: null,
  conflictCopyId: null,
  message: null,
});

function sliceFor(nodeId: string): NodeSyncSlice {
  return byNode.get(nodeId) ?? emptySlice();
}

function publish() {
  const slice = focusNodeId ? sliceFor(focusNodeId) : emptySlice();
  const status: SyncStatus = {
    focusNodeId,
    ...slice,
  };
  for (const listener of listeners) listener(status);
}

/**
 * Update sync fields for one document. The header badge only reflects the
 * focused editor document (see setSyncFocus).
 */
function emitFor(nodeId: string, patch: Partial<NodeSyncSlice>) {
  const next = { ...sliceFor(nodeId), ...patch };
  byNode.set(nodeId, next);
  if (focusNodeId === nodeId) publish();
}

/** Tell the status bar which open essay to describe. */
export function setSyncFocus(nodeId: string | null) {
  focusNodeId = nodeId;
  publish();
}

export function getSyncStatus(): SyncStatus {
  const slice = focusNodeId ? sliceFor(focusNodeId) : emptySlice();
  return { focusNodeId, ...slice };
}

export function subscribeSyncStatus(listener: StatusListener): () => void {
  listeners.add(listener);
  listener(getSyncStatus());
  return () => listeners.delete(listener);
}

export type OpenedDocument = {
  nodeId: string;
  markdown: string;
  baseVersion: number;
  dirty: boolean;
};

export const SIGNED_OUT_MESSAGE = "Signed out. Sign in again to sync.";

/**
 * Auth-shaped failures (expired JWT, revoked session) — the fix is a login,
 * not a retry, so the status badge should say that instead of "sync failed".
 */
export function isAuthError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const err = error as { code?: unknown; status?: unknown; message?: unknown };
  if (err.status === 401 || err.status === 403) return true;
  // PostgREST JWT errors: PGRST301 (expired/invalid), PGRST302 (anon blocked).
  if (err.code === "PGRST301" || err.code === "PGRST302") return true;
  const message = typeof err.message === "string" ? err.message : "";
  return /\bjwt\b|not authenticated|refresh token|invalid claim/i.test(
    message
  );
}

/** Load a document: prefer dirty local copy, else remote, then seed IDB. */
export async function openDocument(nodeId: string): Promise<OpenedDocument> {
  const local = await getLocalDoc(nodeId);

  if (local?.dirty) {
    // Unsynced local edits always win here; divergence resolves at push
    // time. Skipping the remote fetch also lets dirty docs open offline.
    // Do not clear conflictCopyId / message — openDocument runs after
    // conflict resolution and was wiping the banner instantly.
    emitFor(nodeId, {
      dirty: true,
      localSavedAt: local.updatedAt,
      error: null,
    });
    return {
      nodeId,
      markdown: local.markdown,
      baseVersion: local.baseVersion,
      dirty: true,
    };
  }

  let remote: Awaited<ReturnType<typeof fetchRemoteDocument>> = null;
  let remoteError: unknown = null;
  try {
    remote = await fetchRemoteDocument(nodeId);
  } catch (error) {
    // Offline or Supabase unreachable — fall back to the local copy below.
    remoteError = error;
  }

  if (remote) {
    const next: LocalDoc = {
      nodeId,
      markdown: remote.markdown,
      updatedAt: remote.updated_at,
      dirty: false,
      baseVersion: Number(remote.version),
    };
    await putLocalDoc(next);
    emitFor(nodeId, {
      dirty: false,
      localSavedAt: next.updatedAt,
      syncedAt: remote.updated_at,
      error: null,
    });
    return {
      nodeId,
      markdown: remote.markdown,
      baseVersion: Number(remote.version),
      dirty: false,
    };
  }

  if (local) {
    emitFor(nodeId, {
      dirty: local.dirty,
      localSavedAt: local.updatedAt,
      error: null,
    });
    return {
      nodeId,
      markdown: local.markdown,
      baseVersion: local.baseVersion,
      dirty: local.dirty,
    };
  }

  throw remoteError instanceof Error
    ? remoteError
    : new Error("Document not found");
}

/**
 * Instant local autosave. Always inherits the latest known baseVersion from
 * IndexedDB so a keystroke during/after sync cannot stomp a newer version
 * and manufacture a conflict on the next push.
 */
export async function saveLocal(
  nodeId: string,
  markdown: string,
  baseVersionHint: number
): Promise<void> {
  const updatedAt = new Date().toISOString();
  await stageLocalEdit(nodeId, markdown, baseVersionHint, updatedAt);
  const prev = sliceFor(nodeId);
  emitFor(nodeId, {
    dirty: true,
    localSavedAt: updatedAt,
    error: null,
    // Keep an existing conflict banner until the user dismisses / opens it.
    message: prev.conflictCopyId ? prev.message : null,
  });
}

async function createConflictCopy(
  nodeId: string,
  localMarkdown: string
): Promise<string> {
  const node = await getWorkspaceNode(nodeId);
  const baseName = node?.name?.replace(/\.md$/i, "") ?? "Document";
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const copyName = `${baseName} (conflict ${stamp}).md`;
  return createWorkspaceNode({
    kind: "document",
    name: copyName,
    parentId: node?.parent_id ?? null,
    markdown: localMarkdown,
  });
}

async function catchUpToRemote(
  nodeId: string,
  remoteMarkdown: string,
  remoteVersion: number
): Promise<void> {
  const updatedAt = new Date().toISOString();
  await adoptRemoteDoc(nodeId, remoteMarkdown, remoteVersion, updatedAt);
  emitFor(nodeId, {
    syncing: false,
    dirty: false,
    syncedAt: updatedAt,
    localSavedAt: updatedAt,
    conflictCopyId: null,
    message: null,
    error: null,
  });
}

/**
 * Resolve a save_document conflict. Same-content races (stale baseVersion
 * after a push that already landed) catch up quietly. Divergent content
 * creates a conflict copy and adopts the remote document.
 */
async function handleSaveConflict(
  nodeId: string,
  attempted: LocalDoc,
  result: Extract<
    Awaited<ReturnType<typeof saveDocumentRemote>>,
    { ok: false }
  >
): Promise<boolean> {
  if (result.remoteMarkdown == null) return false;

  const remoteVersion = Number(
    result.remoteVersion ?? attempted.baseVersion + 1
  );

  // Same bytes (or whitespace-normalized): just catch up — no copy.
  if (normalize(attempted.markdown) === normalize(result.remoteMarkdown)) {
    await catchUpToRemote(nodeId, result.remoteMarkdown, remoteVersion);
    return true;
  }

  // Re-read: a concurrent keystroke/sync may have already aligned versions.
  const remote = await fetchRemoteDocument(nodeId);
  const fresh = await getLocalDoc(nodeId);
  if (
    remote &&
    fresh &&
    normalize(fresh.markdown) === normalize(remote.markdown)
  ) {
    await catchUpToRemote(nodeId, remote.markdown, Number(remote.version));
    return true;
  }

  const localMarkdown = fresh?.markdown ?? attempted.markdown;
  const copyId = await createConflictCopy(nodeId, localMarkdown);
  const resolvedRemote = remote?.markdown ?? result.remoteMarkdown;
  const resolvedVersion = Number(remote?.version ?? remoteVersion);
  await catchUpToRemote(nodeId, resolvedRemote, resolvedVersion);
  emitFor(nodeId, {
    conflictCopyId: copyId,
    message:
      "This document changed in the cloud while syncing. Your local edits were saved as a conflict copy.",
  });
  return true;
}

async function syncDocumentOnce(nodeId: string): Promise<void> {
  const local = await getLocalDoc(nodeId);
  if (!local || !local.dirty) {
    await dequeueSync(nodeId);
    return;
  }

  // Re-read right before RPC in case another writer advanced the version.
  const latest = await getLocalDoc(nodeId);
  if (!latest?.dirty) {
    await dequeueSync(nodeId);
    return;
  }

  emitFor(nodeId, { syncing: true, error: null });

  try {
    const previousRemote = await fetchRemoteDocument(nodeId);
    const previousMarkdown = previousRemote?.markdown ?? "";

    const result = await saveDocumentRemote(
      nodeId,
      latest.markdown,
      latest.baseVersion
    );

    if (result.ok) {
      // Best-effort: free Storage for essay images dropped from this doc.
      void releaseRemovedEssayImages(previousMarkdown, latest.markdown).catch(
        () => {}
      );

      const updatedAt = new Date().toISOString();
      // Single IDB transaction: keystrokes that landed during the RPC keep
      // their dirty draft (with the advanced baseVersion); otherwise the doc
      // goes clean and its queue entry drops. No read-modify-write window.
      const settled = await settleSyncedDoc(
        nodeId,
        latest.markdown,
        result.version,
        updatedAt
      );

      if (settled.dirty) {
        emitFor(nodeId, {
          syncing: false,
          dirty: true,
          syncedAt: updatedAt,
          localSavedAt: settled.updatedAt,
          error: null,
        });
        // Push the newer draft after the mutex clears (macrotask, not microtask).
        setTimeout(() => {
          void syncDocument(nodeId);
        }, 0);
      } else {
        emitFor(nodeId, {
          syncing: false,
          dirty: false,
          syncedAt: updatedAt,
          localSavedAt: updatedAt,
          error: null,
          conflictCopyId: null,
          message: null,
        });
      }
      return;
    }

    if (result.reason === "conflict" && result.remoteMarkdown != null) {
      const handled = await handleSaveConflict(nodeId, latest, result);
      if (handled) return;
    }

    if (result.reason === "quota") {
      emitFor(nodeId, {
        syncing: false,
        error: "Cloud sync blocked: storage quota exceeded.",
      });
      return;
    }

    emitFor(nodeId, {
      syncing: false,
      error: `Cloud sync failed (${result.reason}).`,
    });
  } catch (error) {
    const message = isAuthError(error)
      ? SIGNED_OUT_MESSAGE
      : error instanceof Error
        ? error.message
        : "Cloud sync failed.";
    emitFor(nodeId, { syncing: false, error: message });
  }
}

/**
 * Fast-forward a clean local copy to a newer remote version (edited on
 * another device while this tab slept). Returns the adopted document when
 * the open editor should reload, else null. Dirty drafts are left alone —
 * they resolve through the normal push/conflict path.
 */
export async function fastForwardDocument(
  nodeId: string
): Promise<OpenedDocument | null> {
  const local = await getLocalDoc(nodeId);
  if (local?.dirty) return null;

  let remote: Awaited<ReturnType<typeof fetchRemoteDocument>> = null;
  try {
    remote = await fetchRemoteDocument(nodeId);
  } catch {
    return null; // offline — nothing to fast-forward
  }
  if (!remote) return null;

  const remoteVersion = Number(remote.version);
  if (local && remoteVersion <= local.baseVersion) return null;

  // Re-check dirtiness atomically-ish: a keystroke may have landed during
  // the fetch. Never overwrite a dirty draft from here.
  const fresh = await getLocalDoc(nodeId);
  if (fresh?.dirty) return null;

  await putLocalDoc({
    nodeId,
    markdown: remote.markdown,
    updatedAt: remote.updated_at,
    dirty: false,
    baseVersion: remoteVersion,
  });
  emitFor(nodeId, {
    dirty: false,
    localSavedAt: remote.updated_at,
    syncedAt: remote.updated_at,
    error: null,
  });
  return {
    nodeId,
    markdown: remote.markdown,
    baseVersion: remoteVersion,
    dirty: false,
  };
}

/** Push one document to Supabase with optimistic concurrency. */
export async function syncDocument(nodeId: string): Promise<void> {
  const current = inflight.get(nodeId);
  if (current) return current;
  const run = syncDocumentOnce(nodeId).finally(() => {
    inflight.delete(nodeId);
  });
  inflight.set(nodeId, run);
  return run;
}

export async function flushSyncQueue(): Promise<void> {
  if (typeof navigator !== "undefined" && !navigator.onLine) return;
  const queue = await listSyncQueue();
  for (const item of queue) {
    if (item.op === "put") {
      await syncDocument(item.nodeId);
    }
  }
}

export function formatSyncLabel(s: SyncStatus): string {
  if (!s.focusNodeId) return "Not synced yet";
  if (s.syncing) return "Syncing…";
  if (s.error) return "Sync error";
  if (s.dirty) return "Saved locally · syncing soon";
  if (s.syncedAt) {
    const mins = Math.max(
      0,
      Math.round((Date.now() - new Date(s.syncedAt).getTime()) / 60000)
    );
    if (mins < 1) return "Saved locally · Synced just now";
    if (mins === 1) return "Saved locally · Synced 1m ago";
    return `Saved locally · Synced ${mins}m ago`;
  }
  if (s.localSavedAt) return "Saved locally";
  return "Not synced yet";
}
