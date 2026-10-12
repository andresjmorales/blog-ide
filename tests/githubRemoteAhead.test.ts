import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/workspace/api", () => ({ listDocumentRevisions: vi.fn(async () => []) }));

import { gitBlobSha } from "@/lib/github/blobSha";
import { githubRemoteAhead } from "@/lib/github/remoteAhead";
import { loadGithubSyncBase, recordGithubSyncBases } from "@/lib/github/syncBase";

const where = { nodeId: "n1", repo: "o/r", branch: "main", path: "posts/a.md" };

beforeEach(() => localStorage.clear());

describe("githubRemoteAhead", () => {
  it("is false when GitHub matches the draft, and records that sync point", async () => {
    const sha = await gitBlobSha("Same.\n");
    expect(await githubRemoteAhead({ ...where, remoteSha: sha, localMarkdown: "Same.\n" })).toBe(false);
    expect(loadGithubSyncBase("n1", "o/r", "main")?.blobSha).toBe(sha);
  });

  it("is false when GitHub still has the last synced version (only BlogIDE edited)", async () => {
    const sha = await gitBlobSha("Pushed.\n");
    recordGithubSyncBases([{ ...where, blobSha: sha }]);
    expect(await githubRemoteAhead({ ...where, remoteSha: sha, localMarkdown: "Pushed.\n\nMore.\n" })).toBe(false);
  });

  it("is false when GitHub has an older saved BlogIDE version", async () => {
    const sha = await gitBlobSha("Old draft.\n");
    expect(
      await githubRemoteAhead({
        ...where,
        remoteSha: sha,
        localMarkdown: "New draft.\n",
        loadRevisions: async () => ["Newer.\n", "Old draft.\n"],
      })
    ).toBe(false);
  });

  it("is true when GitHub has a version BlogIDE never had", async () => {
    recordGithubSyncBases([{ ...where, blobSha: await gitBlobSha("Pushed.\n") }]);
    expect(
      await githubRemoteAhead({
        ...where,
        remoteSha: await gitBlobSha("Edited in another tool.\n"),
        localMarkdown: "Pushed.\n",
        loadRevisions: async () => ["Pushed.\n"],
      })
    ).toBe(true);
  });

  it("ignores files that are not on GitHub", async () => {
    expect(await githubRemoteAhead({ ...where, remoteSha: undefined, localMarkdown: "x" })).toBe(false);
  });
});
