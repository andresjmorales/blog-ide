import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchGithubFileFromLink,
  githubLinkCandidates,
  parseGithubFileLink,
} from "@/lib/github/importUrl";

describe("parseGithubFileLink", () => {
  it("parses blob, edit, and raw github.com links", () => {
    for (const action of ["blob", "edit", "raw"]) {
      expect(
        parseGithubFileLink(
          `https://github.com/me/blog/${action}/main/posts/my%20essay.md`
        )
      ).toEqual({
        owner: "me",
        repo: "blog",
        refAndPath: ["main", "posts", "my essay.md"],
      });
    }
  });

  it("parses raw.githubusercontent.com links, including refs/heads", () => {
    expect(
      parseGithubFileLink(
        "https://raw.githubusercontent.com/me/blog/refs/heads/main/README.md"
      )
    ).toEqual({ owner: "me", repo: "blog", refAndPath: ["main", "README.md"] });
  });

  it("ignores query strings, fragments, and a missing scheme", () => {
    expect(
      parseGithubFileLink("github.com/me/blog/blob/main/a.md?plain=1#L4")
    ).toEqual({ owner: "me", repo: "blog", refAndPath: ["main", "a.md"] });
  });

  it("rejects non-file links and other hosts", () => {
    expect(parseGithubFileLink("https://github.com/me/blog")).toBeNull();
    expect(parseGithubFileLink("https://github.com/me/blog/tree/main/posts")).toBeNull();
    expect(parseGithubFileLink("https://gitlab.com/me/blog/blob/main/a.md")).toBeNull();
    expect(parseGithubFileLink("https://github.com/me/blog/blob/main")).toBeNull();
    expect(parseGithubFileLink("https://github.com/me/blog/blob/main/../x.md")).toBeNull();
    expect(parseGithubFileLink("not a link")).toBeNull();
  });
});

describe("githubLinkCandidates", () => {
  it("lists branch/path splits shortest branch first", () => {
    expect(
      githubLinkCandidates({
        owner: "me",
        repo: "blog",
        refAndPath: ["feature", "x", "posts", "a.md"],
      })
    ).toEqual([
      { branch: "feature", path: "x/posts/a.md" },
      { branch: "feature/x", path: "posts/a.md" },
      { branch: "feature/x/posts", path: "a.md" },
    ]);
  });
});

describe("fetchGithubFileFromLink", () => {
  afterEach(() => vi.unstubAllGlobals());

  function stubContents(files: Record<string, string>) {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      void init;
      const key = decodeURIComponent(url.replace("https://api.github.com", ""));
      if (key in files) {
        return new Response(
          JSON.stringify({
            type: "file",
            encoding: "base64",
            content: btoa(files[key]),
            path: "",
          }),
          { status: 200 }
        );
      }
      return new Response(JSON.stringify({ message: "Not Found" }), {
        status: 404,
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("resolves a branch name containing a slash", async () => {
    stubContents({
      "/repos/me/blog/contents/posts/a.md?ref=feature/x": "# Hi\n",
    });
    await expect(
      fetchGithubFileFromLink({
        link: "https://github.com/me/blog/blob/feature/x/posts/a.md",
        token: "",
      })
    ).resolves.toEqual({
      repo: "me/blog",
      branch: "feature/x",
      path: "posts/a.md",
      markdown: "# Hi\n",
    });
  });

  it("sends no Authorization header without a token", async () => {
    const fetchMock = stubContents({
      "/repos/me/blog/contents/a.md?ref=main": "x",
    });
    await fetchGithubFileFromLink({
      link: "https://github.com/me/blog/blob/main/a.md",
      token: "",
    });
    const init = fetchMock.mock.calls[0][1];
    expect(new Headers(init?.headers).has("Authorization")).toBe(false);
  });

  it("refuses non-markdown files and missing files", async () => {
    stubContents({});
    await expect(
      fetchGithubFileFromLink({
        link: "https://github.com/me/blog/blob/main/a.txt",
        token: "",
      })
    ).rejects.toThrow(/Only \.md files/);
    await expect(
      fetchGithubFileFromLink({
        link: "https://github.com/me/blog/blob/main/a.md",
        token: "t",
      })
    ).rejects.toThrow(/could not find/);
  });
});
