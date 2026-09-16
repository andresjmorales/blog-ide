import { describe, expect, it } from "vitest";
import {
  ensureMarkdownFileName,
  formatGithubRepo,
  githubBasename,
  isMarkdownGithubPath,
  joinGithubPath,
  normalizeGithubPath,
  parseGithubRepo,
  requireGithubDocumentPath,
  sanitizeGithubFileName,
} from "@/lib/github/repo";

describe("parseGithubRepo", () => {
  it("accepts owner/repo", () => {
    expect(parseGithubRepo("andresjmorales/blog-ide")).toEqual({
      owner: "andresjmorales",
      repo: "blog-ide",
    });
  });

  it("accepts github.com URLs and strips .git", () => {
    expect(parseGithubRepo("https://github.com/acme/site.git")).toEqual({
      owner: "acme",
      repo: "site",
    });
  });

  it("rejects empty, traversal, and malformed input", () => {
    expect(parseGithubRepo("")).toBeNull();
    expect(parseGithubRepo("just-a-name")).toBeNull();
    expect(parseGithubRepo("./repo")).toBeNull();
    expect(parseGithubRepo("owner/..")).toBeNull();
  });
});

describe("joinGithubPath / file names", () => {
  it("joins posix segments and drops . and ..", () => {
    expect(joinGithubPath("content/essays", "series/one.md")).toBe(
      "content/essays/series/one.md"
    );
    expect(joinGithubPath("/content/", "../x.md")).toBe("x.md");
    expect(joinGithubPath("", "README.md")).toBe("README.md");
  });

  it("normalizes paths and basenames", () => {
    expect(normalizeGithubPath("/drafts/foo.md/")).toBe("drafts/foo.md");
    expect(githubBasename("drafts/foo.md")).toBe("foo.md");
    expect(githubBasename("/published/foo.md")).toBe("foo.md");
  });

  it("sanitizes names and ensures a .md suffix", () => {
    expect(sanitizeGithubFileName("a/b:c")).toBe("a-b-c");
    expect(ensureMarkdownFileName("README")).toBe("README.md");
    expect(ensureMarkdownFileName("notes.md")).toBe("notes.md");
  });

  it("requires essay maps to be a .md file, not a folder", () => {
    expect(isMarkdownGithubPath("drafts/new-essay.md")).toBe(true);
    expect(isMarkdownGithubPath("README.MD")).toBe(true);
    expect(isMarkdownGithubPath("drafts")).toBe(false);
    expect(isMarkdownGithubPath("drafts/new-essay")).toBe(false);
    expect(requireGithubDocumentPath("/drafts/new-essay.md/")).toBe(
      "drafts/new-essay.md"
    );
    expect(() => requireGithubDocumentPath("drafts")).toThrow(/\.md file/i);
    expect(() => requireGithubDocumentPath("")).toThrow(/ending in \.md/i);
  });

  it("formats owner/repo", () => {
    expect(formatGithubRepo({ owner: "a", repo: "b" })).toBe("a/b");
  });
});
