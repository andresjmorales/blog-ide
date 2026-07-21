import { describe, expect, it } from "vitest";
import {
  collectSubtreeIds,
  documentIdsInSubtree,
  eligibleMoveFolders,
  folderPathLabel,
  isInTrash,
  listInboxChannels,
} from "@/lib/workspace/tree";
import type { WorkspaceNode } from "@/lib/workspace/types";

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
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...partial,
  };
}

function fixture() {
  const essays = node({ kind: "folder", name: "essays" });
  const series = node({ kind: "folder", name: "series", parent_id: essays.id });
  const doc1 = node({ name: "one.md", parent_id: series.id });
  const doc2 = node({ name: "two.md", parent_id: essays.id });
  const drafts = node({ kind: "folder", name: "drafts" });
  const trash = node({ kind: "folder", name: "Trash", system_key: "trash" });
  const trashed = node({ name: "gone.md", parent_id: trash.id });
  const inbox = node({ kind: "folder", name: "Inbox", system_key: "inbox" });
  const notes = node({ name: "notes.md", parent_id: inbox.id, position: 0 });
  const all = [essays, series, doc1, doc2, drafts, trash, trashed, inbox, notes];
  return { essays, series, doc1, doc2, drafts, trash, trashed, inbox, notes, all };
}

describe("collectSubtreeIds / documentIdsInSubtree", () => {
  it("collects a folder, its descendants, and only its documents", () => {
    const f = fixture();
    const ids = collectSubtreeIds(f.essays.id, f.all);
    expect(new Set(ids)).toEqual(
      new Set([f.essays.id, f.series.id, f.doc1.id, f.doc2.id])
    );
    expect(new Set(documentIdsInSubtree(f.essays.id, f.all))).toEqual(
      new Set([f.doc1.id, f.doc2.id])
    );
  });
});

describe("isInTrash", () => {
  it("detects the trash folder and anything nested in it", () => {
    const f = fixture();
    expect(isInTrash(f.trash.id, f.all)).toBe(true);
    expect(isInTrash(f.trashed.id, f.all)).toBe(true);
    expect(isInTrash(f.doc1.id, f.all)).toBe(false);
  });
});

describe("eligibleMoveFolders", () => {
  it("excludes the moving subtree and the Trash", () => {
    const f = fixture();
    const targets = eligibleMoveFolders(f.all, f.essays.id);
    const ids = targets.map((t) => t.id);
    expect(ids).not.toContain(f.essays.id); // itself
    expect(ids).not.toContain(f.series.id); // descendant (cycle)
    expect(ids).not.toContain(f.trash.id);
    expect(ids).toContain(f.drafts.id);
    expect(ids).toContain(f.inbox.id);
  });

  it("can include the Trash when asked (move-to-trash flow)", () => {
    const f = fixture();
    const targets = eligibleMoveFolders(f.all, f.doc1.id, {
      includeTrash: true,
    });
    expect(targets.map((t) => t.id)).toContain(f.trash.id);
  });
});

describe("listInboxChannels / folderPathLabel", () => {
  it("lists document channels under the Inbox in position order", () => {
    const f = fixture();
    const channels = listInboxChannels(f.all);
    expect(channels.map((c) => c.id)).toEqual([f.notes.id]);
  });

  it("renders a folder path from the root", () => {
    const f = fixture();
    expect(folderPathLabel(f.series.id, f.all)).toBe("essays/series");
    expect(folderPathLabel(null, f.all)).toBe("Workspace root");
  });
});
