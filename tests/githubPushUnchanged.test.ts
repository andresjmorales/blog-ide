import { afterEach, describe, expect, it, vi } from "vitest";
import { gitBlobSha } from "@/lib/github/blobSha";
import { pushFilesToGithub } from "@/lib/github/client";
import { githubPushSummary } from "@/lib/github/push";

describe("gitBlobSha", () => {
  it("matches git hash-object", async () => {
    // printf 'hello\n' | git hash-object --stdin
    expect(await gitBlobSha("hello\n")).toBe(
      "ce013625030ba8dba906f756967f9e9ca394464a"
    );
    // printf 'é' | git hash-object --stdin (2 UTF-8 bytes)
    expect(await gitBlobSha("é")).toBe(
      "4b04fff51468d8ab5201ab02b725dc477bc7cb45"
    );
  });
});

type Call = { method: string; path: string; body?: string };

async function mockRepo(remoteFiles: Record<string, string>) {
  const tree = await Promise.all(
    Object.entries(remoteFiles).map(async ([path, content]) => ({
      path,
      type: "blob",
      sha: await gitBlobSha(content),
    }))
  );
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const path = url.replace("https://api.github.com", "");
      const method = init.method ?? "GET";
      calls.push({ method, path, body: init.body as string | undefined });
      const json = (body: unknown) =>
        new Response(JSON.stringify(body), { status: 200 });
      if (path === "/repos/o/r") return json({ default_branch: "main" });
      if (path.startsWith("/repos/o/r/git/ref/heads/"))
        return json({ object: { sha: "parent" } });
      if (path === "/repos/o/r/git/commits/parent")
        return json({ sha: "parent", tree: { sha: "base-tree" } });
      if (path.startsWith("/repos/o/r/git/trees/base-tree"))
        return json({ sha: "base-tree", tree });
      if (path === "/repos/o/r/git/blobs") return json({ sha: "new-blob" });
      if (path === "/repos/o/r/git/trees") return json({ sha: "new-tree" });
      if (path === "/repos/o/r/git/commits")
        return json({ sha: "new-commit", tree: { sha: "new-tree" } });
      if (path.startsWith("/repos/o/r/git/refs/heads/")) return json({});
      return new Response("{}", { status: 404 });
    })
  );
  return calls;
}

describe("pushFilesToGithub", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("skips the commit when every file already matches", async () => {
    const calls = await mockRepo({ "essays/a.md": "# A\n" });
    const result = await pushFilesToGithub({
      token: "t",
      repo: "o/r",
      branch: "main",
      files: [{ path: "essays/a.md", content: "# A\n" }],
      message: "m",
    });
    expect(result.unchanged).toBe(true);
    expect(result.fileCount).toBe(0);
    expect(calls.some((c) => c.method === "POST")).toBe(false);
    expect(githubPushSummary([result])).toMatch(/Nothing to push/);
  });

  it("uploads only the files that changed", async () => {
    const calls = await mockRepo({
      "essays/a.md": "# A\n",
      "essays/b.md": "# B\n",
    });
    const result = await pushFilesToGithub({
      token: "t",
      repo: "o/r",
      branch: "main",
      files: [
        { path: "essays/a.md", content: "# A\n" },
        { path: "essays/b.md", content: "# B, edited\n" },
        { path: "essays/c.md", content: "# C\n" },
      ],
      message: (changed) => changed.map((f) => f.path).join(","),
    });
    const commit = calls.find(
      (c) => c.method === "POST" && c.path.endsWith("/git/commits")
    );
    expect(JSON.parse(commit!.body!).message).toBe("essays/b.md,essays/c.md");
    expect(result.unchanged).toBeUndefined();
    expect(result.fileCount).toBe(2);
    expect(
      calls.filter((c) => c.method === "POST" && c.path.endsWith("/git/blobs"))
    ).toHaveLength(2);
    expect(githubPushSummary([result])).toBe("Pushed 2 files to GitHub.");
  });
});
