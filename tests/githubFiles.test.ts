import { describe, expect, it } from "vitest";
import {
  buildGithubPushPlans,
  listGithubMapNodes,
} from "@/lib/github/files";
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
    color: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...partial,
  };
}

function fixture() {
  seq = 0;
  const essays = node({ kind: "folder", name: "essays" });
  const series = node({ kind: "folder", name: "series", parent_id: essays.id });
  const doc1 = node({ name: "one.md", parent_id: series.id });
  const doc2 = node({ name: "two.md", parent_id: essays.id });
  const readme = node({ name: "about.md" });
  const trash = node({ kind: "folder", name: "Trash", system_key: "trash" });
  const trashed = node({ name: "gone.md", parent_id: trash.id });
  const all = [essays, series, doc1, doc2, readme, trash, trashed];
  const bodies = new Map([
    [doc1.id, "# One\n"],
    [doc2.id, "# Two\n"],
    [readme.id, "# About\n"],
    [trashed.id, "# Gone\n"],
  ]);
  return { essays, series, doc1, doc2, readme, trash, trashed, all, bodies };
}

describe("buildGithubPushPlans", () => {
  it("maps a full workspace under the default path and skips Trash", () => {
    const f = fixture();
    const plans = buildGithubPushPlans({
      nodes: f.all,
      bodies: f.bodies,
      defaultRepo: "me/site",
      defaultBranch: "main",
      defaultPath: "content",
      maps: [],
      scope: "workspace",
    });
    expect(plans).toHaveLength(1);
    expect(plans[0].repo).toBe("me/site");
    const paths = plans[0].files.map((file) => file.path).sort();
    expect(paths).toEqual([
      "content/about.md",
      "content/essays/series/one.md",
      "content/essays/two.md",
    ]);
    expect(paths.some((p) => p.includes("gone"))).toBe(false);
  });

  it("uses a folder map prefix and a document map for README.md", () => {
    const f = fixture();
    const plans = buildGithubPushPlans({
      nodes: f.all,
      bodies: f.bodies,
      defaultRepo: "me/site",
      defaultBranch: "main",
      defaultPath: "unused",
      maps: [
        { nodeId: f.essays.id, path: "posts" },
        { nodeId: f.readme.id, repo: "me/blog-ide", path: "README.md" },
      ],
      scope: "workspace",
    });
    const byRepo = new Map(plans.map((p) => [p.repo, p]));
    expect(byRepo.get("me/site")?.files.map((file) => file.path).sort()).toEqual(
      ["posts/series/one.md", "posts/two.md"]
    );
    expect(byRepo.get("me/blog-ide")?.files).toEqual([
      { path: "README.md", content: "# About\n" },
    ]);
  });

  it("pushes a single document to its mapped path", () => {
    const f = fixture();
    const plans = buildGithubPushPlans({
      nodes: f.all,
      bodies: f.bodies,
      defaultRepo: "me/site",
      defaultBranch: "main",
      defaultPath: "content",
      maps: [{ nodeId: f.doc2.id, path: "essays/two.md" }],
      scope: { nodeId: f.doc2.id },
    });
    expect(plans[0].files).toEqual([
      { path: "essays/two.md", content: "# Two\n" },
    ]);
  });

  it("refuses Trash and an empty default repo with no maps", () => {
    const f = fixture();
    expect(() =>
      buildGithubPushPlans({
        nodes: f.all,
        bodies: f.bodies,
        defaultRepo: "",
        defaultBranch: "main",
        defaultPath: "",
        maps: [],
        scope: "workspace",
      })
    ).toThrow(/default GitHub repo/i);
    expect(() =>
      buildGithubPushPlans({
        nodes: f.all,
        bodies: f.bodies,
        defaultRepo: "me/site",
        defaultBranch: "main",
        defaultPath: "",
        maps: [],
        scope: { nodeId: f.trash.id },
      })
    ).toThrow(/Trash/i);
  });
});

describe("listGithubMapNodes", () => {
  it("lists folders and documents outside Trash", () => {
    const f = fixture();
    const labels = listGithubMapNodes(f.all).map((n) => n.label);
    expect(labels).toContain("essays");
    expect(labels).toContain("essays/series/one.md");
    expect(labels.some((l) => l.toLowerCase().includes("trash"))).toBe(false);
    expect(labels.some((l) => l.includes("gone"))).toBe(false);
  });
});
