/**
 * "Import from GitHub": turn a pasted GitHub link to a markdown file into
 * repo + branch + path, then fetch it. The new essay is mapped to that exact
 * file so Push / Pull / Diff work right away.
 */

import { fetchGithubFileContent } from "@/lib/github/client";
import { isMarkdownGithubPath, normalizeGithubPath } from "@/lib/github/repo";

export type GithubFileLink = {
  owner: string;
  repo: string;
  /**
   * Everything after owner/repo (and after `blob`/`edit`/`raw`), still joined.
   * The branch is a prefix of this, but branch names can contain `/`, so the
   * split is resolved against GitHub.
   */
  refAndPath: string[];
};

export type ResolvedGithubFile = {
  repo: string;
  branch: string;
  path: string;
  markdown: string;
};

const NAME_RE = /^[A-Za-z0-9_.-]+$/;

function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/**
 * Accepts:
 * - https://github.com/owner/repo/blob/main/docs/post.md
 * - https://github.com/owner/repo/edit/main/docs/post.md
 * - https://github.com/owner/repo/raw/main/docs/post.md
 * - https://raw.githubusercontent.com/owner/repo/main/docs/post.md
 * - https://raw.githubusercontent.com/owner/repo/refs/heads/main/docs/post.md
 * Query strings and #fragments are ignored. Returns null for anything else.
 */
export function parseGithubFileLink(input: string): GithubFileLink | null {
  let raw = input.trim();
  if (!raw) return null;
  if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  const segments = url.pathname
    .split("/")
    .filter(Boolean)
    .map(decodeSegment);

  let owner: string | undefined;
  let repo: string | undefined;
  let rest: string[];
  if (host === "github.com") {
    [owner, repo] = segments;
    const action = segments[2];
    if (action !== "blob" && action !== "edit" && action !== "raw") return null;
    rest = segments.slice(3);
  } else if (host === "raw.githubusercontent.com") {
    [owner, repo] = segments;
    rest = segments.slice(2);
    if (rest[0] === "refs" && rest[1] === "heads") rest = rest.slice(2);
  } else {
    return null;
  }
  if (!owner || !repo || !NAME_RE.test(owner) || !NAME_RE.test(repo)) {
    return null;
  }
  repo = repo.replace(/\.git$/i, "");
  // Need at least a branch and a file name.
  if (rest.length < 2) return null;
  if (rest.some((segment) => segment === "." || segment === "..")) return null;
  return { owner, repo, refAndPath: rest };
}

/** Every branch/path split, shortest branch first (`main` before `main/x`). */
export function githubLinkCandidates(
  link: GithubFileLink
): Array<{ branch: string; path: string }> {
  const out: Array<{ branch: string; path: string }> = [];
  for (let i = 1; i < link.refAndPath.length; i += 1) {
    const branch = link.refAndPath.slice(0, i).join("/");
    const path = normalizeGithubPath(link.refAndPath.slice(i).join("/"));
    if (path) out.push({ branch, path });
  }
  return out;
}

export const GITHUB_IMPORT_LINK_HINT =
  "Paste a link to a .md file, e.g. https://github.com/you/blog/blob/main/posts/essay.md";

/** Parse the link and fetch the markdown. Works without a token for public repos. */
export async function fetchGithubFileFromLink(input: {
  link: string;
  token: string;
}): Promise<ResolvedGithubFile> {
  const link = parseGithubFileLink(input.link);
  if (!link) {
    throw new Error(`That does not look like a GitHub file link. ${GITHUB_IMPORT_LINK_HINT}`);
  }
  const candidates = githubLinkCandidates(link);
  if (!candidates.some((candidate) => isMarkdownGithubPath(candidate.path))) {
    throw new Error(
      "Only .md files can be imported and mapped. Link to a markdown file, not a folder or another file type."
    );
  }
  const repo = `${link.owner}/${link.repo}`;
  for (const candidate of candidates) {
    if (!isMarkdownGithubPath(candidate.path)) continue;
    const markdown = await fetchGithubFileContent({
      token: input.token,
      repo,
      branch: candidate.branch,
      path: candidate.path,
    });
    if (markdown !== null) {
      return { repo, branch: candidate.branch, path: candidate.path, markdown };
    }
  }
  throw new Error(
    input.token
      ? "GitHub could not find that file. Check the link, and that your token can read the repo."
      : "GitHub could not find that file. For a private repo, add a GitHub token in Settings first."
  );
}
