import {
  dequeueSync,
  enqueueSync,
  getLocalDoc,
  listSyncQueue,
  putLocalDoc,
  type LocalDoc,
} from "@/lib/db/indexed";
import { normalize } from "@/lib/markdown/pipeline";
import {
  createWorkspaceNode,
  fetchRemoteDocument,
  getWorkspaceNode,
  saveDocumentRemote,
} from "@/lib/workspace/api";

export type SyncStatus = {
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

let status: SyncStatus = {
  localSavedAt: null,
  syncedAt: null,
  dirty: false,
  syncing: false,
  error: null,
  conflictCopyId: null,
  message: null,
};

function emit(patch: Partial<SyncStatus>) {
  status = { ...status, ...patch };
  for (const listener of listeners) listener(status);
}

export function getSyncStatus(): SyncStatus {
  return status;
}

export function subscribeSyncStatus(listener: StatusListener): () => void {
  listeners.add(listener);
  listener(status);
  return () => listeners.delete(listener);
}

export type OpenedDocument = {
  nodeId: string;
  markdown: string;
  baseVersion: number;
  dirty: boolean;
};

/** Load a document: prefer dirty local copy, else remote, then seed IDB. */
export async function openDocument(nodeId: string): Promise<OpenedDocument> {
  const local = await getLocalDoc(nodeId);
  const remote = await fetchRemoteDocument(nodeId);

  if (!remote && !local) {
    throw new Error("Document not found");
  }

  if (local?.dirty) {
    emit({
      dirty: true,
      localSavedAt: local.updatedAt,
      error: null,
      message: null,
      conflictCopyId: null,
    });
    return {
      nodeId,
      markdown: local.markdown,
      baseVersion: local.baseVersion,
      dirty: true,
    };
  }

  if (remote) {
    if (!local || local.baseVersion < remote.version || !local.dirty) {
      const next: LocalDoc = {
        nodeId,
        markdown: remote.markdown,
        updatedAt: remote.updated_at,
        dirty: false,
        baseVersion: Number(remote.version),
      };
      await putLocalDoc(next);
      emit({
        dirty: false,
        localSavedAt: next.updatedAt,
        syncedAt: remote.updated_at,
        error: null,
        message: null,
        conflictCopyId: null,
      });
      return {
        nodeId,
        markdown: remote.markdown,
        baseVersion: Number(remote.version),
        dirty: false,
      };
    }
  }

  const fallback = local!;
  emit({
    dirty: fallback.dirty,
    localSavedAt: fallback.updatedAt,
    error: null,
  });
  return {
    nodeId,
    markdown: fallback.markdown,
    baseVersion: fallback.baseVersion,
    dirty: fallback.dirty,
  };
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
  const existing = await getLocalDoc(nodeId);
  const baseVersion = Math.max(
    existing?.baseVersion ?? 0,
    baseVersionHint || 0
  );
  const updatedAt = new Date().toISOString();
  await putLocalDoc({
    nodeId,
    markdown,
    updatedAt,
    dirty: true,
    baseVersion: baseVersion || 1,
  });
  await enqueueSync(nodeId, "put");
  emit({
    dirty: true,
    localSavedAt: updatedAt,
    error: null,
    // Keep an existing conflict banner until the user dismisses / opens it.
    message: status.conflictCopyId ? status.message : null,
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

  emit({ syncing: true, error: null });

  try {
    const result = await saveDocumentRemote(
      nodeId,
      latest.markdown,
      latest.baseVersion
    );

    if (result.ok) {
      const after = await getLocalDoc(nodeId);
      const updatedAt = new Date().toISOString();
      const newerEdits =
        after && after.dirty && after.markdown !== latest.markdown;

      if (newerEdits) {
        // Keystrokes landed during the RPC — keep them, advance baseVersion.
        await putLocalDoc({
          ...after,
          baseVersion: result.version,
        });
        emit({
          syncing: false,
          dirty: true,
          syncedAt: updatedAt,
          localSavedAt: after.updatedAt,
          error: null,
        });
        // Push the newer draft after the mutex clears (macrotask, not microtask).
        setTimeout(() => {
          void syncDocument(nodeId);
        }, 0);
      } else {
        await putLocalDoc({
          nodeId,
          markdown: latest.markdown,
          dirty: false,
          baseVersion: result.version,
          updatedAt,
        });
        await dequeueSync(nodeId);
        emit({
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
      const remoteVersion = Number(result.remoteVersion ?? latest.baseVersion + 1);

      // Same bytes (or whitespace-normalized): just catch up — no copy.
      if (normalize(latest.markdown) === normalize(result.remoteMarkdown)) {
        const updatedAt = new Date().toISOString();
        await putLocalDoc({
          nodeId,
          markdown: result.remoteMarkdown,
          updatedAt,
          dirty: false,
          baseVersion: remoteVersion,
        });
        await dequeueSync(nodeId);
        emit({
          syncing: false,
          dirty: false,
          syncedAt: updatedAt,
          localSavedAt: updatedAt,
          conflictCopyId: null,
          message: null,
          error: null,
        });
        return;
      }

      const copyId = await createConflictCopy(nodeId, latest.markdown);
      const updatedAt = new Date().toISOString();
      await putLocalDoc({
        nodeId,
        markdown: result.remoteMarkdown,
        updatedAt,
        dirty: false,
        baseVersion: remoteVersion,
      });
      await dequeueSync(nodeId);
      emit({
        syncing: false,
        dirty: false,
        syncedAt: updatedAt,
        localSavedAt: updatedAt,
        conflictCopyId: copyId,
        message:
          "This document changed in the cloud while syncing. Your local edits were saved as a conflict copy.",
        error: null,
      });
      return;
    }

    if (result.reason === "quota") {
      emit({
        syncing: false,
        error: "Cloud sync blocked: storage quota exceeded (200 MB).",
      });
      return;
    }

    emit({
      syncing: false,
      error: `Cloud sync failed (${result.reason}).`,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Cloud sync failed.";
    emit({ syncing: false, error: message });
  }
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
