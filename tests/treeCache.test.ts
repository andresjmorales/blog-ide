import { afterEach, describe, expect, it } from "vitest";
import {
  loadCachedWorkspaceTree,
  saveCachedWorkspaceTree,
} from "@/lib/workspace/treeCache";
import type { WorkspaceNode } from "@/lib/workspace/types";

function node(id: string): WorkspaceNode {
  return {
    id,
    user_id: "u",
    parent_id: null,
    kind: "document",
    name: "scratchpad.md",
    position: 0,
    url: null,
    pinned: false,
    system_key: "scratchpad",
    color: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
}

describe("workspace tree cache", () => {
  afterEach(() => {
    localStorage.clear();
  });

  it("round-trips a tree keyed by email", () => {
    saveCachedWorkspaceTree("Ada@example.com", [node("n1")], "n1");
    const loaded = loadCachedWorkspaceTree("ada@example.com");
    expect(loaded?.nodes).toHaveLength(1);
    expect(loaded?.nodes[0]?.id).toBe("n1");
    expect(loaded?.scratchpadId).toBe("n1");
    expect(loadCachedWorkspaceTree("other@example.com")).toBeNull();
  });

  it("rejects a corrupted payload", () => {
    localStorage.setItem(
      "blogide.workspaceTree.v1:ada@example.com",
      JSON.stringify({ v: 1, nodes: [{ nope: true }] })
    );
    expect(loadCachedWorkspaceTree("ada@example.com")).toBeNull();
  });
});
