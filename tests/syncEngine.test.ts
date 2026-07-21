import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  getLocalDoc,
  listSyncQueue,
  putLocalDoc,
  stageLocalEdit,
} from "@/lib/db/indexed";
import { openDocument, saveLocal, syncDocument } from "@/lib/sync/engine";
import {
  fetchRemoteDocument,
  saveDocumentRemote,
} from "@/lib/workspace/api";

vi.mock("@/lib/workspace/api", () => ({
  fetchRemoteDocument: vi.fn(),
  saveDocumentRemote: vi.fn(),
  createWorkspaceNode: vi.fn(),
  getWorkspaceNode: vi.fn(),
}));

const mockFetchRemote = vi.mocked(fetchRemoteDocument);
const mockSaveRemote = vi.mocked(saveDocumentRemote);

let seq = 0;
function freshNodeId(): string {
  seq += 1;
  return `00000000-0000-0000-0000-${String(seq).padStart(12, "0")}`;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("openDocument", () => {
  it("falls back to the local copy when the remote fetch fails (offline)", async () => {
    const nodeId = freshNodeId();
    await putLocalDoc({
      nodeId,
      markdown: "# Local essay\n",
      updatedAt: new Date().toISOString(),
      dirty: false,
      baseVersion: 3,
    });
    mockFetchRemote.mockRejectedValue(new Error("Failed to fetch"));

    const opened = await openDocument(nodeId);
    expect(opened.markdown).toBe("# Local essay\n");
    expect(opened.baseVersion).toBe(3);
    expect(opened.dirty).toBe(false);
  });

  it("returns a dirty local draft without touching the network", async () => {
    const nodeId = freshNodeId();
    await putLocalDoc({
      nodeId,
      markdown: "unsynced edits",
      updatedAt: new Date().toISOString(),
      dirty: true,
      baseVersion: 5,
    });

    const opened = await openDocument(nodeId);
    expect(opened.markdown).toBe("unsynced edits");
    expect(opened.dirty).toBe(true);
    expect(mockFetchRemote).not.toHaveBeenCalled();
  });

  it("still rejects when there is no local copy and no remote", async () => {
    const nodeId = freshNodeId();
    mockFetchRemote.mockResolvedValue(null);
    await expect(openDocument(nodeId)).rejects.toThrow("Document not found");
  });
});

describe("saveLocal", () => {
  it("never regresses baseVersion from a stale hint", async () => {
    const nodeId = freshNodeId();
    await putLocalDoc({
      nodeId,
      markdown: "v5 content",
      updatedAt: new Date().toISOString(),
      dirty: false,
      baseVersion: 5,
    });

    await saveLocal(nodeId, "new keystrokes", 2);

    const doc = await getLocalDoc(nodeId);
    expect(doc?.baseVersion).toBe(5);
    expect(doc?.dirty).toBe(true);
    expect(doc?.markdown).toBe("new keystrokes");
  });

  it("stages the edit and its queue entry together", async () => {
    const nodeId = freshNodeId();
    await saveLocal(nodeId, "draft", 1);
    const queue = await listSyncQueue();
    expect(queue.some((item) => item.nodeId === nodeId)).toBe(true);
  });
});

describe("syncDocument", () => {
  it("clears dirty and dequeues after a clean push", async () => {
    const nodeId = freshNodeId();
    await saveLocal(nodeId, "essay body", 1);
    mockSaveRemote.mockResolvedValue({ ok: true, version: 2, sizeBytes: 10 });

    await syncDocument(nodeId);

    const doc = await getLocalDoc(nodeId);
    expect(doc?.dirty).toBe(false);
    expect(doc?.baseVersion).toBe(2);
    const queue = await listSyncQueue();
    expect(queue.some((item) => item.nodeId === nodeId)).toBe(false);
  });

  it("keeps a keystroke that lands mid-push dirty, with the new baseVersion", async () => {
    const nodeId = freshNodeId();
    await saveLocal(nodeId, "first draft", 1);

    // Hold the RPC open, type during it, then let it land.
    let releasePush: (value: { ok: true; version: number; sizeBytes: number }) => void;
    const gate = new Promise<{ ok: true; version: number; sizeBytes: number }>(
      (resolve) => {
        releasePush = resolve;
      }
    );
    mockSaveRemote.mockReturnValueOnce(gate);
    // The engine re-pushes the newer draft afterwards; let that one succeed.
    mockSaveRemote.mockResolvedValue({ ok: true, version: 3, sizeBytes: 12 });

    const push = syncDocument(nodeId);
    // Only type once the push is actually in flight.
    await vi.waitFor(() => expect(mockSaveRemote).toHaveBeenCalledTimes(1));
    await stageLocalEdit(
      nodeId,
      "first draft plus keystrokes",
      1,
      new Date().toISOString()
    );
    releasePush!({ ok: true, version: 2, sizeBytes: 11 });
    await push;

    const doc = await getLocalDoc(nodeId);
    expect(doc?.markdown).toBe("first draft plus keystrokes");
    // Either still dirty at baseVersion 2 (before the follow-up push fires)
    // or already settled clean at 3 — never clean with lost keystrokes.
    if (doc?.dirty) {
      expect(doc.baseVersion).toBe(2);
    } else {
      expect(doc?.baseVersion).toBe(3);
    }

    // Let the deferred follow-up push settle so it can't leak across tests.
    await new Promise((resolve) => setTimeout(resolve, 10));
    const settled = await getLocalDoc(nodeId);
    expect(settled?.markdown).toBe("first draft plus keystrokes");
    expect(settled?.dirty).toBe(false);
    expect(settled?.baseVersion).toBe(3);
  });
});
