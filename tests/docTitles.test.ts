import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { putLocalDoc } from "@/lib/db/indexed";
import { listAllDocumentBodies } from "@/lib/workspace/api";
import {
  loadDocumentTitles,
  titleCandidateNodes,
  titleFromMarkdown,
} from "@/lib/workspace/docTitles";
import type { WorkspaceNode } from "@/lib/workspace/types";

vi.mock("@/lib/workspace/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/workspace/api")>();
  return {
    ...actual,
    listAllDocumentBodies: vi.fn(),
  };
});

const mockListBodies = vi.mocked(listAllDocumentBodies);

let seq = 0;
function node(partial: Partial<WorkspaceNode>): WorkspaceNode {
  seq += 1;
  return {
    id: `id-${seq}`,
    user_id: "u",
    parent_id: null,
    kind: "document",
    name: `doc-${seq}.md`,
    position: seq,
    url: null,
    pinned: false,
    system_key: null,
    color: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...partial,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockListBodies.mockResolvedValue(new Map());
});

describe("titleFromMarkdown", () => {
  it("reads a frontmatter title", () => {
    expect(
      titleFromMarkdown("---\ntitle: Hello World\n---\n\nBody\n")
    ).toBe("Hello World");
  });

  it("returns null when title is absent", () => {
    expect(titleFromMarkdown("# Just a heading\n")).toBeNull();
  });
});

describe("titleCandidateNodes", () => {
  it("skips Notes channels and Trash documents", () => {
    const essays = node({ kind: "folder", name: "essays" });
    const essay = node({ name: "essay.md", parent_id: essays.id });
    const inbox = node({ kind: "folder", name: "Notes", system_key: "inbox" });
    const channel = node({ name: "general.md", parent_id: inbox.id });
    const trash = node({ kind: "folder", name: "Trash", system_key: "trash" });
    const trashed = node({ name: "gone.md", parent_id: trash.id });
    const ids = titleCandidateNodes([
      essays,
      essay,
      inbox,
      channel,
      trash,
      trashed,
    ]).map((n) => n.id);
    expect(ids).toEqual([essay.id]);
  });
});

describe("loadDocumentTitles", () => {
  it("prefers remote titles over clean stale IndexedDB copies", async () => {
    const essay = node({ id: "doc-a", name: "New Title.md" });
    await putLocalDoc({
      nodeId: essay.id,
      markdown: "---\ntitle: Old Title\n---\n\nBody\n",
      updatedAt: "2026-01-01T00:00:00Z",
      dirty: false,
      baseVersion: 1,
    });
    mockListBodies.mockResolvedValue(
      new Map([
        [essay.id, "---\ntitle: New Title\n---\n\nBody\n"],
      ])
    );

    const titles = await loadDocumentTitles([essay]);
    expect(titles.get(essay.id)).toBe("New Title");
    expect(mockListBodies).toHaveBeenCalledOnce();
  });

  it("keeps dirty local titles even when remote differs", async () => {
    const essay = node({ id: "doc-b", name: "Draft Title.md" });
    await putLocalDoc({
      nodeId: essay.id,
      markdown: "---\ntitle: Draft Title\n---\n\nBody\n",
      updatedAt: "2026-01-02T00:00:00Z",
      dirty: true,
      baseVersion: 2,
    });
    mockListBodies.mockResolvedValue(
      new Map([
        [essay.id, "---\ntitle: Cloud Title\n---\n\nBody\n"],
      ])
    );

    const titles = await loadDocumentTitles([essay]);
    expect(titles.get(essay.id)).toBe("Draft Title");
    // Dirty docs should not require a remote round-trip.
    expect(mockListBodies).not.toHaveBeenCalled();
  });

  it("falls back to clean local titles when remote fetch fails", async () => {
    const essay = node({ id: "doc-c", name: "Offline.md" });
    await putLocalDoc({
      nodeId: essay.id,
      markdown: "---\ntitle: Offline Title\n---\n\nBody\n",
      updatedAt: "2026-01-01T00:00:00Z",
      dirty: false,
      baseVersion: 1,
    });
    mockListBodies.mockRejectedValue(new Error("offline"));

    const titles = await loadDocumentTitles([essay]);
    expect(titles.get(essay.id)).toBe("Offline Title");
  });
});
