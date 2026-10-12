import { beforeEach, describe, expect, it, vi } from "vitest";
import { gitBlobSha } from "@/lib/github/blobSha";

const client = vi.hoisted(() => ({
  fetchGithubPathCommits: vi.fn(),
  fetchGithubFileAtRef: vi.fn(),
  fetchGithubBlob: vi.fn(),
}));
vi.mock("@/lib/github/client", () => client);

import {
  alignSignedAssetUrls,
  changedSince,
  githubPullSituation,
  loadGithubPullHistory,
} from "@/lib/github/syncHistory";
import { loadGithubSyncBase, recordGithubSyncBases } from "@/lib/github/syncBase";

const SIGN = "https://x.supabase.co/storage/v1/object/sign/assets/u/img.png";

function commit(sha: string, subject = `commit ${sha}`) {
  return { sha, subject, author: "me", date: "2026-10-01T00:00:00Z", htmlUrl: `https://github.com/o/r/commit/${sha}` };
}

const input = {
  token: "t",
  repo: "o/r",
  branch: "main",
  path: "posts/a.md",
  nodeId: "n1",
  localEditedAt: "2026-10-10T00:00:00Z",
};

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

describe("alignSignedAssetUrls", () => {
  it("swaps tokens for the reference's URL to the same file", () => {
    const old = `![a](${SIGN}?token=OLD)`;
    const fresh = `![a](${SIGN}?token=NEW)`;
    expect(alignSignedAssetUrls(old, fresh)).toBe(fresh);
    expect(changedSince(old, fresh)).toBe(false);
    expect(changedSince(old, `${fresh}\n\nMore.`)).toBe(true);
  });
});

describe("loadGithubPullHistory", () => {
  it("finds the base from a commit matching a saved BlogIDE version", async () => {
    const base = "Base.\n";
    const local = "Base.\n\nMine.\n";
    const remote = "Base, edited.\n";
    client.fetchGithubPathCommits.mockResolvedValue([commit("c3"), commit("c2"), commit("c1")]);
    client.fetchGithubFileAtRef.mockImplementation(async ({ ref }: { ref: string }) => {
      const content = ref === "c2" ? base : "older\n";
      return { sha: await gitBlobSha(content), content };
    });
    const history = await loadGithubPullHistory({
      ...input,
      localMarkdown: local,
      remoteMarkdown: remote,
      loadRevisions: async () => [local, base],
    });
    expect(history.base?.markdown).toBe(base);
    expect(history.base?.source).toBe("history");
    expect(history.base?.commit?.sha).toBe("c2");
    expect(history.remoteCommits.map((c) => c.sha)).toEqual(["c3"]);
    expect(githubPullSituation(history)).toBe("diverged");
    // The newest commit is the current remote: no fetch needed for it.
    expect(client.fetchGithubFileAtRef).toHaveBeenCalledTimes(1);
  });

  it("uses the sync point recorded by a push even when revisions rolled off", async () => {
    const pushed = "Pushed.\n";
    recordGithubSyncBases(
      [{ nodeId: "n1", repo: "o/r", branch: "main", path: "posts/a.md", blobSha: await gitBlobSha(pushed) }],
      "2026-10-05T00:00:00Z"
    );
    client.fetchGithubPathCommits.mockResolvedValue([commit("c2"), commit("c1")]);
    client.fetchGithubFileAtRef.mockResolvedValue({ sha: await gitBlobSha(pushed), content: pushed });
    const history = await loadGithubPullHistory({
      ...input,
      localMarkdown: pushed,
      remoteMarkdown: "Edited elsewhere.\n",
      loadRevisions: async () => [],
    });
    expect(history.base).toMatchObject({ source: "recorded", syncedAt: "2026-10-05T00:00:00Z" });
    expect(history.remoteCommits.map((c) => c.sha)).toEqual(["c2"]);
    expect(githubPullSituation(history)).toBe("github-ahead");
  });

  it("falls back to the recorded blob when it is older than the commits checked", async () => {
    const pushed = "Pushed.\n";
    recordGithubSyncBases([
      { nodeId: "n1", repo: "o/r", branch: "main", path: "posts/a.md", blobSha: await gitBlobSha(pushed) },
    ]);
    client.fetchGithubPathCommits.mockResolvedValue([commit("c9")]);
    client.fetchGithubBlob.mockResolvedValue(pushed);
    const history = await loadGithubPullHistory({
      ...input,
      localMarkdown: "Pushed.\n\nMine.\n",
      remoteMarkdown: "Theirs.\n",
      loadRevisions: async () => [],
    });
    expect(history.base?.markdown).toBe(pushed);
    expect(history.base?.commit).toBeNull();
    expect(history.remoteCommits.map((c) => c.sha)).toEqual(["c9"]);
    expect(githubPullSituation(history)).toBe("diverged");
  });

  it("says when only BlogIDE moved on", async () => {
    const base = "Base.\n";
    client.fetchGithubPathCommits.mockResolvedValue([commit("c1")]);
    const history = await loadGithubPullHistory({
      ...input,
      localMarkdown: "Base.\n\nMine.\n",
      remoteMarkdown: base,
      loadRevisions: async () => [base],
    });
    expect(history.remoteCommits).toEqual([]);
    expect(githubPullSituation(history)).toBe("blogide-ahead");
  });

  it("reports an unknown base when nothing matches", async () => {
    client.fetchGithubPathCommits.mockResolvedValue([commit("c1")]);
    const history = await loadGithubPullHistory({
      ...input,
      localMarkdown: "Mine.\n",
      remoteMarkdown: "Theirs.\n",
      loadRevisions: async () => [],
    });
    expect(history.base).toBeNull();
    expect(githubPullSituation(history)).toBe("unknown");
  });
});

describe("sync base records", () => {
  it("are scoped to repo and branch", async () => {
    recordGithubSyncBases([{ nodeId: "n1", repo: "O/R", branch: "main", path: "a.md", blobSha: "abc" }]);
    expect(loadGithubSyncBase("n1", "o/r", "main")?.blobSha).toBe("abc");
    expect(loadGithubSyncBase("n1", "o/r", "draft")).toBeNull();
    expect(loadGithubSyncBase("n1", "o/other", "main")).toBeNull();
  });
});
