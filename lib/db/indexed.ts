import { openDB, type DBSchema, type IDBPDatabase } from "idb";

export type LocalDoc = {
  nodeId: string;
  markdown: string;
  updatedAt: string;
  dirty: boolean;
  baseVersion: number;
};

export type SyncQueueItem = {
  nodeId: string;
  op: "put" | "delete";
  queuedAt: string;
};

interface BlogIdeDB extends DBSchema {
  docs: {
    key: string;
    value: LocalDoc;
  };
  syncQueue: {
    key: string;
    value: SyncQueueItem;
  };
}

const DB_NAME = "blogide";
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<BlogIdeDB>> | null = null;

function getDb() {
  if (typeof indexedDB === "undefined") {
    throw new Error("IndexedDB is not available");
  }
  if (!dbPromise) {
    dbPromise = openDB<BlogIdeDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("docs")) {
          db.createObjectStore("docs", { keyPath: "nodeId" });
        }
        if (!db.objectStoreNames.contains("syncQueue")) {
          db.createObjectStore("syncQueue", { keyPath: "nodeId" });
        }
      },
    });
  }
  return dbPromise;
}

export async function getLocalDoc(nodeId: string): Promise<LocalDoc | undefined> {
  const db = await getDb();
  return db.get("docs", nodeId);
}

/**
 * Write a dirty local draft and enqueue its sync in ONE transaction.
 * The base version can only move forward, so a keystroke saved while a
 * sync is settling can never resurrect a stale version.
 */
export async function stageLocalEdit(
  nodeId: string,
  markdown: string,
  baseVersionHint: number,
  updatedAt: string
): Promise<LocalDoc> {
  const db = await getDb();
  const tx = db.transaction(["docs", "syncQueue"], "readwrite");
  const docs = tx.objectStore("docs");
  const existing = await docs.get(nodeId);
  const next: LocalDoc = {
    nodeId,
    markdown,
    updatedAt,
    dirty: true,
    baseVersion:
      Math.max(existing?.baseVersion ?? 0, baseVersionHint || 0) || 1,
  };
  await docs.put(next);
  await tx
    .objectStore("syncQueue")
    .put({ nodeId, op: "put", queuedAt: updatedAt });
  await tx.done;
  return next;
}

/**
 * Settle a successful push in ONE transaction: if no newer edit landed while
 * the RPC was in flight, mark the doc clean and drop the queue entry;
 * otherwise keep the newer draft dirty and only adopt the new base version.
 */
export async function settleSyncedDoc(
  nodeId: string,
  pushedMarkdown: string,
  newBaseVersion: number,
  updatedAt: string
): Promise<LocalDoc> {
  const db = await getDb();
  const tx = db.transaction(["docs", "syncQueue"], "readwrite");
  const docs = tx.objectStore("docs");
  const current = await docs.get(nodeId);
  let next: LocalDoc;
  if (!current || current.markdown === pushedMarkdown) {
    next = {
      nodeId,
      markdown: pushedMarkdown,
      updatedAt,
      dirty: false,
      baseVersion: newBaseVersion,
    };
    await docs.put(next);
    await tx.objectStore("syncQueue").delete(nodeId);
  } else {
    next = { ...current, baseVersion: newBaseVersion };
    await docs.put(next);
  }
  await tx.done;
  return next;
}

/** Adopt the remote copy as clean local state and clear the queue entry. */
export async function adoptRemoteDoc(
  nodeId: string,
  markdown: string,
  baseVersion: number,
  updatedAt: string
): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(["docs", "syncQueue"], "readwrite");
  await tx.objectStore("docs").put({
    nodeId,
    markdown,
    updatedAt,
    dirty: false,
    baseVersion,
  });
  await tx.objectStore("syncQueue").delete(nodeId);
  await tx.done;
}

export async function putLocalDoc(doc: LocalDoc): Promise<void> {
  const db = await getDb();
  await db.put("docs", doc);
}

export async function deleteLocalDoc(nodeId: string): Promise<void> {
  const db = await getDb();
  await db.delete("docs", nodeId);
  await db.delete("syncQueue", nodeId);
}

export async function enqueueSync(
  nodeId: string,
  op: "put" | "delete" = "put"
): Promise<void> {
  const db = await getDb();
  await db.put("syncQueue", {
    nodeId,
    op,
    queuedAt: new Date().toISOString(),
  });
}

export async function listSyncQueue(): Promise<SyncQueueItem[]> {
  const db = await getDb();
  return db.getAll("syncQueue");
}

export async function dequeueSync(nodeId: string): Promise<void> {
  const db = await getDb();
  await db.delete("syncQueue", nodeId);
}
