import { describe, expect, it } from "vitest";
import {
  workspaceDeleteToastMessage,
  workspaceItemLabel,
  workspaceMoveToastMessage,
} from "@/lib/workspace/actionToast";
import type { WorkspaceNode } from "@/lib/workspace/types";

let seq = 0;
function node(
  partial: Partial<WorkspaceNode> & Pick<WorkspaceNode, "kind" | "name">
): WorkspaceNode {
  seq += 1;
  return {
    id: partial.id ?? `id-${seq}`,
    user_id: "u",
    parent_id: null,
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

describe("workspace action toasts", () => {
  it("labels folders with a trailing slash and essays by title", () => {
    const folder = node({ kind: "folder", name: "essays" });
    const essay = node({ id: "doc-1", kind: "document", name: "one.md" });
    expect(workspaceItemLabel(folder)).toBe("essays/");
    expect(workspaceItemLabel(essay)).toBe("one");
    expect(
      workspaceItemLabel(essay, new Map([["doc-1", "  First essay  "]]))
    ).toBe("First essay");
  });

  it("describes move, trash, restore, and delete", () => {
    const essays = node({ kind: "folder", name: "essays" });
    const drafts = node({ kind: "folder", name: "drafts" });
    const trash = node({
      kind: "folder",
      name: "Trash",
      system_key: "trash",
    });
    const doc = node({
      id: "doc-1",
      kind: "document",
      name: "one.md",
      parent_id: essays.id,
    });
    const folder = node({
      kind: "folder",
      name: "clips",
      parent_id: essays.id,
    });
    const nodes = [essays, drafts, trash, doc, folder];
    const titles = new Map([["doc-1", "One"]]);

    expect(
      workspaceMoveToastMessage({
        node: doc,
        parentId: drafts.id,
        trashId: trash.id,
        wasInTrash: false,
        nodes,
        titles,
      })
    ).toBe("Moved “One” to drafts.");

    expect(
      workspaceMoveToastMessage({
        node: folder,
        parentId: trash.id,
        trashId: trash.id,
        wasInTrash: false,
        nodes,
      })
    ).toBe("Moved “clips/” to Trash.");

    expect(
      workspaceMoveToastMessage({
        node: folder,
        parentId: null,
        trashId: trash.id,
        wasInTrash: true,
        nodes,
      })
    ).toBe("Restored “clips/”.");

    expect(
      workspaceMoveToastMessage({
        node: doc,
        parentId: essays.id,
        trashId: trash.id,
        wasInTrash: true,
        nodes,
        titles,
      })
    ).toBe("Restored “One” to essays.");

    expect(workspaceDeleteToastMessage(folder)).toBe(
      "Deleted “clips/” permanently."
    );
  });
});
