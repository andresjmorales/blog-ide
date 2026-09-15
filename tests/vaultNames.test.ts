import { describe, expect, it } from "vitest";
import {
  editorFileNameForNode,
  isVaultNamePlaceholder,
  restoredVaultFileName,
} from "@/lib/vault/names";
import type { WorkspaceNode } from "@/lib/workspace/types";

function node(
  partial: Partial<WorkspaceNode> & Pick<WorkspaceNode, "id" | "kind" | "name">
): WorkspaceNode {
  return {
    user_id: "u",
    parent_id: null,
    position: 0,
    url: null,
    pinned: false,
    system_key: null,
    color: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...partial,
  };
}

describe("isVaultNamePlaceholder", () => {
  it("matches the public column and uniquified .md forms", () => {
    expect(isVaultNamePlaceholder("encrypted")).toBe(true);
    expect(isVaultNamePlaceholder("encrypted.md")).toBe(true);
    expect(isVaultNamePlaceholder("encrypted (2).md")).toBe(true);
    expect(isVaultNamePlaceholder("encrypted (10).md")).toBe(true);
    expect(isVaultNamePlaceholder("Essay.md")).toBe(false);
    expect(isVaultNamePlaceholder("Encrypted.md")).toBe(false);
  });
});

describe("editorFileNameForNode", () => {
  it("does not feed the placeholder to the editor", () => {
    const doc = node({ id: "v1", kind: "document", name: "encrypted" });
    expect(editorFileNameForNode(doc, new Map(), true)).toBeNull();
    expect(
      editorFileNameForNode(doc, new Map([["v1", "encrypted (2).md"]]), true)
    ).toBeNull();
    expect(
      editorFileNameForNode(doc, new Map([["v1", "notes.md"]]), true)
    ).toBe("notes.md");
  });
});

describe("restoredVaultFileName", () => {
  it("rebuilds a filename from a surviving frontmatter title", () => {
    expect(restoredVaultFileName("encrypted (2).md", "My essay")).toBe(
      "My essay.md"
    );
    expect(restoredVaultFileName("notes.md", "My essay")).toBeNull();
    expect(restoredVaultFileName("encrypted.md", "encrypted")).toBeNull();
  });
});
