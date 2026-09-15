import { describe, expect, it } from "vitest";
import {
  explorerDisplayName,
  fileStem,
} from "@/lib/workspace/explorerDisplay";
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

describe("explorerDisplayName", () => {
  it("hides .md on ordinary essays", () => {
    const doc = node({ id: "d1", kind: "document", name: "essay.md" });
    expect(fileStem(doc)).toBe("essay");
    expect(explorerDisplayName(doc)).toBe("essay");
  });

  it("prefers a frontmatter title when it differs from the stem", () => {
    const doc = node({ id: "d1", kind: "document", name: "essay.md" });
    expect(
      explorerDisplayName(doc, new Map([["d1", "A longer title"]]))
    ).toBe("A longer title");
  });

  it("strips .md from decrypted vault filenames", () => {
    const doc = node({
      id: "v1",
      kind: "document",
      name: "encrypted",
    });
    const vaultNames = new Map([["v1", "secret notes.md"]]);
    expect(explorerDisplayName(doc, undefined, vaultNames)).toBe("secret notes");
  });

  it("uses decrypted frontmatter titles for unlocked vault essays", () => {
    const doc = node({
      id: "v1",
      kind: "document",
      name: "encrypted",
    });
    const vaultNames = new Map([["v1", "secret notes.md"]]);
    const titles = new Map([["v1", "Secret notes"]]);
    expect(explorerDisplayName(doc, titles, vaultNames)).toBe("Secret notes");
  });

  it("keeps the locked placeholder (no title, no .md)", () => {
    const doc = node({
      id: "v1",
      kind: "document",
      name: "encrypted",
    });
    expect(explorerDisplayName(doc)).toBe("encrypted");
  });
});
