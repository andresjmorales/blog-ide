import { describe, expect, it } from "vitest";
import { decodeGithubFileContent } from "@/lib/github/client";
import {
  assessGithubBinding,
  findBasenameCandidates,
  inspectPushFiles,
  prefixExists,
  remapGithubMaps,
} from "@/lib/github/status";
import type { GithubResolvedBinding, GithubTreeIndex } from "@/lib/github/types";

const index: GithubTreeIndex = {
  blobs: [
    "published/two.md",
    "posts/series/one.md",
    "README.md",
  ],
  trees: ["published", "posts", "posts/series"],
  truncated: false,
};

function binding(
  partial: Partial<GithubResolvedBinding> & Pick<GithubResolvedBinding, "nodeId" | "path" | "kind">
): GithubResolvedBinding {
  return {
    repo: "me/site",
    branch: "main",
    source: "direct",
    mapNodeId: partial.nodeId,
    ...partial,
  };
}

describe("GitHub mapping health", () => {
  it("treats a git-moved file as missing with a candidate", () => {
    const status = assessGithubBinding(
      binding({
        nodeId: "doc-2",
        kind: "document",
        path: "drafts/two.md",
      }),
      index
    );
    expect(status.health).toBe("missing");
    expect(status.candidates).toEqual(["published/two.md"]);
  });

  it("marks a live mapped path as ok", () => {
    const status = assessGithubBinding(
      binding({
        nodeId: "readme",
        kind: "document",
        path: "README.md",
      }),
      index
    );
    expect(status.health).toBe("ok");
    expect(status.candidates).toEqual([]);
  });

  it("treats a folder prefix with files as present", () => {
    expect(prefixExists("posts", index)).toBe(true);
    expect(prefixExists("drafts", index)).toBe(false);
  });

  it("warns a push that would recreate a moved file", () => {
    const issues = inspectPushFiles(
      [{ path: "drafts/two.md", nodeId: "doc-2" }],
      "me/site",
      "main",
      index
    );
    expect(issues).toEqual([
      {
        nodeId: "doc-2",
        repo: "me/site",
        branch: "main",
        plannedPath: "drafts/two.md",
        candidates: ["published/two.md"],
      },
    ]);
  });

  it("does not warn for a first-time path with no same-name twin", () => {
    expect(
      inspectPushFiles(
        [{ path: "brand-new.md", nodeId: "n" }],
        "me/site",
        "main",
        index
      )
    ).toEqual([]);
  });

  it("finds same-basename candidates and remaps", () => {
    expect(findBasenameCandidates("drafts/two.md", index.blobs)).toEqual([
      "published/two.md",
    ]);
    const maps = remapGithubMaps(
      [
        { nodeId: "doc-2", path: "drafts/two.md" },
        { nodeId: "folder", path: "drafts" },
      ],
      [{ nodeId: "doc-2", path: "published/two.md" }]
    );
    expect(maps[0].path).toBe("published/two.md");
    const created = remapGithubMaps(
      [{ nodeId: "folder", path: "drafts" }],
      [{ nodeId: "doc-2", path: "published/two.md" }]
    );
    expect(created.some((m) => m.nodeId === "doc-2" && m.path === "published/two.md")).toBe(
      true
    );
  });

  it("decodes GitHub base64 file payloads", () => {
    const encoded = btoa("# Hello\n");
    expect(decodeGithubFileContent(`${encoded}\n`, "base64")).toBe("# Hello\n");
  });
});
