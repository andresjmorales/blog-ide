import { describe, expect, it } from "vitest";
import { exportPathsFor } from "@/lib/export/workspaceZip";
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

describe("exportPathsFor", () => {
  it("nests documents under their folder chain", () => {
    const essays = node({ kind: "folder", name: "essays" });
    const series = node({ kind: "folder", name: "series", parent_id: essays.id });
    const doc = node({ name: "one.md", parent_id: series.id });

    const paths = exportPathsFor([essays, series, doc]);
    expect(paths.get(doc.id)).toBe("essays/series/one.md");
  });

  it("excludes the Trash subtree", () => {
    const trash = node({ kind: "folder", name: "Trash", system_key: "trash" });
    const buried = node({ name: "deleted.md", parent_id: trash.id });
    const kept = node({ name: "kept.md" });

    const paths = exportPathsFor([trash, buried, kept]);
    expect(paths.has(buried.id)).toBe(false);
    expect(paths.get(kept.id)).toBe("kept.md");
  });

  it("appends .md when missing and sanitizes path characters", () => {
    const folder = node({ kind: "folder", name: "a/b: c?" });
    const doc = node({ name: "my: essay", parent_id: folder.id });

    const paths = exportPathsFor([folder, doc]);
    expect(paths.get(doc.id)).toBe("a-b- c-/my- essay.md");
  });

  it("dedupes case-insensitive name collisions", () => {
    const a = node({ name: "essay.md" });
    const b = node({ name: "Essay.md" });
    const c = node({ name: "essay.md" });

    const paths = exportPathsFor([a, b, c]);
    const values = [...paths.values()];
    expect(new Set(values.map((v) => v.toLowerCase())).size).toBe(3);
    expect(values).toContain("essay.md");
    expect(values.some((v) => /\(2\)\.md$/.test(v))).toBe(true);
    expect(values.some((v) => /\(3\)\.md$/.test(v))).toBe(true);
  });

  it("skips folders and links themselves", () => {
    const folder = node({ kind: "folder", name: "essays" });
    const link = node({ kind: "link", name: "ref", url: "https://x.test" });
    const paths = exportPathsFor([folder, link]);
    expect(paths.size).toBe(0);
  });
});
