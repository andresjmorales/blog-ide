import {
  adoptRemoteIfClean,
  dequeueSync,
  getLocalDoc,
  listSyncQueue,
  settleConflictDoc,
  settleSyncedDoc,
  stageLocalEdit,
  type LocalDoc,
} from "@/lib/db/indexed";
import { normalize } from "@/lib/markdown/pipeline";
import { WORKSPACE_READ_TIMEOUT_MS, withTimeout } from "@/lib/net/timeout";
import {
  createDocumentConflictCopy,
  fetchRemoteDocument,
  saveDocumentRemote,
} from "@/lib/workspace/api";
import { plaintextFromConflictPayload, plaintextFromRemote } from "@/lib/vault/document";
import { refreshOwnedAssetUrls } from "@/lib/assets/signedUrls";
import { createClient } from "@/lib/supabase/client";

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
const conflictChannel =
  typeof BroadcastChannel !== "undefined"
    ? new BroadcastChannel("blogide-sync-conflicts")
    : null;

export type CrossTabConflict = {
  originId: string;
  copyId: string;
  localMarkdown: string;
  remoteMarkdown: string;
  remoteVersion: number;
};

type CrossTabConflictListener = (event: CrossTabConflict) => void;
const crossTabConflictListeners = new Set<CrossTabConflictListener>();

conflictChannel?.addEventListener("message", (message: MessageEvent<unknown>) => {
  const event = message.data as Partial<CrossTabConflict> | null;
  if (
    !event ||
    typeof event.originId !== "string" ||
    typeof event.copyId !== "string" ||
    typeof event.localMarkdown !== "string" ||
    typeof event.remoteMarkdown !== "string" ||
    typeof event.remoteVersion !== "number"
  ) {
    return;
  }
  for (const listener of crossTabConflictListeners) {
    listener(event as CrossTabConflict);
  }
});

let focusNodeId: string | null = null;

/**
 * Whether the cloud row at a known version is vault-encrypted. Every change
 * to `enc` goes through save_document (which bumps the version), so when
 * the local baseVersion matches we can skip re-downloading the whole essay
 * before each autosave just to learn how to store it.
 */
const knownRemoteEnc = new Map<string, { version: number; enc: number }>();

function rememberRemoteEnc(nodeId: string, version: number, enc: number) {
  knownRemoteEnc.set(nodeId, { version, enc: enc === 1 ? 1 : 0 });
}

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

export function subscribeCrossTabConflict(
  listener: CrossTabConflictListener
): () => void {
  crossTabConflictListeners.add(listener);
  return () => crossTabConflictListeners.delete(listener);
}

export type OpenedDocument = {
  nodeId: string;
  markdown: string;
  baseVersion: number;
  dirty: boolean;
};

export const SIGNED_OUT_MESSAGE = "Signed out. Sign in again to sync.";

export const LOCAL_SAVE_FAILED_MESSAGE =
  "Could not save on this device. Keep this tab open — retrying.";

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
    remote = await withTimeout(
      fetchRemoteDocument(nodeId),
      WORKSPACE_READ_TIMEOUT_MS
    );
  } catch (error) {
    // Offline, hung, or Supabase unreachable — fall back to the local copy below.
    remoteError = error;
  }

  if (remote) {
    rememberRemoteEnc(nodeId, Number(remote.version), remote.enc ?? 0);
    let markdown = await plaintextFromRemote(remote);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        markdown = await refreshOwnedAssetUrls(markdown, user.id);
      }
    } catch {
      // signed URL refresh is best-effort
    }
    const adopted = await adoptRemoteIfClean(
      nodeId,
      markdown,
      Number(remote.version),
      remote.updated_at
    );
    if (!adopted.adopted) {
      // A draft was staged (another tab, or a restore flush) while the
      // remote was loading — never overwrite it; open the draft instead.
      emitFor(nodeId, {
        dirty: true,
        localSavedAt: adopted.local.updatedAt,
        error: null,
      });
      return {
        nodeId,
        markdown: adopted.local.markdown,
        baseVersion: adopted.local.baseVersion,
        dirty: true,
      };
    }
    emitFor(nodeId, {
      dirty: false,
      localSavedAt: remote.updated_at,
      syncedAt: remote.updated_at,
      error: null,
    });
    return {
      nodeId,
      markdown,
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
  try {
    await stageLocalEdit(nodeId, markdown, baseVersionHint, updatedAt);
  } catch (error) {
    // IndexedDB full, blocked (private mode), or evicted mid-session. The
    // caller keeps the draft in memory and retries; tell the user now so
    // they don't close the tab believing it was saved.
    emitFor(nodeId, {
      error: LOCAL_SAVE_FAILED_MESSAGE,
    });
    throw error;
  }
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
  baseVersion: number,
  localMarkdown: string,
  enc = 0
): Promise<string> {
  const result = await createDocumentConflictCopy(
    nodeId,
    baseVersion,
    localMarkdown,
    { enc }
  );
  if (result.ok) return result.copyId;
  if (result.reason === "quota") {
    throw new Error("Cloud sync blocked: storage quota exceeded.");
  }
  throw new Error(`Could not preserve local conflict (${result.reason}).`);
}

async function catchUpToRemote(
  nodeId: string,
  preservedMarkdown: string,
  remoteMarkdown: string,
  remoteVersion: number
): Promise<void> {
  const updatedAt = new Date().toISOString();
  const settled = await settleConflictDoc(
    nodeId,
    preservedMarkdown,
    remoteMarkdown,
    remoteVersion,
    updatedAt
  );
  emitFor(nodeId, {
    syncing: false,
    dirty: settled.dirty,
    syncedAt: updatedAt,
    localSavedAt: settled.updatedAt,
    conflictCopyId: null,
    message: null,
    error: null,
  });
  if (settled.dirty) {
    setTimeout(() => {
      void syncDocument(nodeId);
    }, 0);
  }
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
  if (result.remoteMarkdown == null && result.remoteEnc !== 1) return false;

  const remoteVersion = Number(
    result.remoteVersion ?? attempted.baseVersion + 1
  );
  const remotePlain = await plaintextFromConflictPayload(result);
  if (remotePlain == null) return false;

  // Same bytes (or whitespace-normalized): just catch up — no copy.
  if (normalize(attempted.markdown) === normalize(remotePlain)) {
    await catchUpToRemote(
      nodeId,
      attempted.markdown,
      remotePlain,
      remoteVersion
    );
    return true;
  }

  // Re-read: a concurrent keystroke/sync may have already aligned versions.
  const remote = await fetchRemoteDocument(nodeId);
  const fresh = await getLocalDoc(nodeId);
  const remoteBody = remote ? await plaintextFromRemote(remote) : remotePlain;
  if (
    remote &&
    fresh &&
    normalize(fresh.markdown) === normalize(remoteBody)
  ) {
    await catchUpToRemote(
      nodeId,
      fresh.markdown,
      remoteBody,
      Number(remote.version)
    );
    return true;
  }

  const localMarkdown = fresh?.markdown ?? attempted.markdown;
  const copyId = await createConflictCopy(
    nodeId,
    attempted.baseVersion,
    localMarkdown,
    remote?.enc === 1 || result.remoteEnc === 1 ? 1 : 0
  );
  const resolvedRemote = remoteBody;
  const resolvedVersion = Number(remote?.version ?? remoteVersion);
  await catchUpToRemote(
    nodeId,
    localMarkdown,
    resolvedRemote,
    resolvedVersion
  );
  emitFor(nodeId, {
    conflictCopyId: copyId,
    message:
      "This document changed elsewhere. Your local edits are safe—review the conflict to choose which version to keep.",
  });
  conflictChannel?.postMessage({
    originId: nodeId,
    copyId,
    localMarkdown,
    remoteMarkdown: resolvedRemote,
    remoteVersion: resolvedVersion,
  } satisfies CrossTabConflict);
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
    let enc: number;
    const known = knownRemoteEnc.get(nodeId);
    if (known && known.version === latest.baseVersion) {
      enc = known.enc;
    } else {
      // Only the storage mode is needed; a stale base will conflict anyway.
      const previousRemote = await fetchRemoteDocument(nodeId);
      enc = previousRemote?.enc === 1 ? 1 : 0;
    }

    const result = await saveDocumentRemote(
      nodeId,
      latest.markdown,
      latest.baseVersion,
      { enc }
    );

    if (result.ok) {
      // Images dropped from the essay are NOT deleted here: an undo, a
      // version-history restore, a conflict copy, or another essay may still
      // reference them. Settings → Clean unused images reclaims the space.
      rememberRemoteEnc(nodeId, result.version, enc);

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

    if (
      result.reason === "conflict" &&
      (result.remoteMarkdown != null || result.remoteEnc === 1)
    ) {
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
    remote = await withTimeout(
      fetchRemoteDocument(nodeId),
      WORKSPACE_READ_TIMEOUT_MS
    );
  } catch {
    return null; // offline / hung — nothing to fast-forward
  }
  if (!remote) return null;

  const remoteVersion = Number(remote.version);
  rememberRemoteEnc(nodeId, remoteVersion, remote.enc ?? 0);
  if (local && remoteVersion <= local.baseVersion) return null;

  const markdown = await plaintextFromRemote(remote);
  // Check-and-write in one IndexedDB transaction: a keystroke that landed
  // during the fetch/decrypt must never be overwritten from here.
  const adopted = await adoptRemoteIfClean(
    nodeId,
    markdown,
    remoteVersion,
    remote.updated_at
  );
  if (!adopted.adopted) return null;
  emitFor(nodeId, {
    dirty: false,
    localSavedAt: remote.updated_at,
    syncedAt: remote.updated_at,
    error: null,
  });
  return {
    nodeId,
    markdown,
    baseVersion: remoteVersion,
    dirty: false,
  };
}

/** Push one document to Supabase with optimistic concurrency. */
export async function syncDocument(nodeId: string): Promise<void> {
  const current = inflight.get(nodeId);
  if (current) return current;
  const sync = () => syncDocumentOnce(nodeId);
  let guarded: Promise<void>;
  if (typeof navigator !== "undefined" && navigator.locks?.request) {
    guarded = (async () => {
      await navigator.locks.request(`blogide-sync:${nodeId}`, () => sync());
    })();
  } else {
    guarded = sync();
  }
  const run = guarded.finally(() => {
    inflight.delete(nodeId);
  });
  inflight.set(nodeId, run);
  return run;
}

/** Push every queued document. Resolves with how many were attempted. */
export async function flushSyncQueue(): Promise<number> {
  if (typeof navigator !== "undefined" && !navigator.onLine) return 0;
  const queue = await listSyncQueue();
  let attempted = 0;
  for (const item of queue) {
    if (item.op === "put") {
      attempted += 1;
      await syncDocument(item.nodeId);
    }
  }
  return attempted;
}

/**
 * Compact relative age for the sync badge.
 * Under 2 days: minutes / hours+minutes (`6h30m`). From 2 days on: whole days (`5d`).
 */
export function formatRelativeSyncAge(
  syncedAt: string | Date,
  nowMs: number = Date.now()
): string {
  const mins = Math.max(
    0,
    Math.round((nowMs - new Date(syncedAt).getTime()) / 60000)
  );
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  if (hours >= 48) {
    return `${Math.floor(hours / 24)}d`;
  }
  if (remMins === 0) return `${hours}h`;
  return `${hours}h${remMins}m`;
}

export function formatSyncLabel(s: SyncStatus): string {
  if (!s.focusNodeId) return "Not synced yet";
  if (s.syncing) return "Syncing…";
  if (s.error) return "Sync error";
  if (s.dirty) return "Saved locally · syncing soon";
  if (s.syncedAt) {
    const age = formatRelativeSyncAge(s.syncedAt);
    if (age === "just now") return "Saved locally · Synced just now";
    return `Saved locally · Synced ${age} ago`;
  }
  if (s.localSavedAt) return "Saved locally";
  return "Not synced yet";
}
