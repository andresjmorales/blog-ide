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
