/**
 * Thin GitHub REST + Git Data API client. Runs in the browser with a
 * user-supplied PAT (Contents/Git scopes). CORS is supported by api.github.com.
 */

import { parseGithubRepo, type GithubRepoRef } from "@/lib/github/repo";
import type {
  GithubFile,
  GithubPushResult,
  GithubTreeIndex,
} from "@/lib/github/types";

const API = "https://api.github.com";
const VERSION = "2022-11-28";

export class GithubApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "GithubApiError";
    this.status = status;
  }
}

export function githubErrorCopy(error: unknown): string {
  if (error instanceof GithubApiError) {
    if (error.status === 401) {
      return "GitHub rejected the token. Create a fine-grained PAT with Contents: Read and write on the target repo, and paste it under Settings.";
    }
    if (error.status === 403) {
      return "GitHub forbade that request (permissions or rate limit). Check the token scopes and try again in a few minutes.";
    }
    if (error.status === 404) {
      return "Repo not found. Check owner/repo, that the token can see it, and that the branch name is right.";
    }
    return error.message;
  }
  if (error instanceof Error) return error.message;
  return "GitHub request failed.";
}

async function githubFetch<T>(
  token: string,
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/vnd.github+json");
  headers.set("Authorization", `Bearer ${token}`);
  headers.set("X-GitHub-Api-Version", VERSION);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${API}${path}`, { ...init, headers });
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = { message: text };
    }
  }
  if (!response.ok) {
    const message =
      body && typeof body === "object" && "message" in body
        ? String((body as { message: string }).message)
        : `GitHub ${response.status}`;
    throw new GithubApiError(response.status, message);
  }
  return body as T;
}

export async function githubWhoAmI(
  token: string
): Promise<{ login: string }> {
  return githubFetch(token, "/user");
}

const TREE_TTL_MS = 20_000;
const treeCache = new Map<
  string,
  { expires: number; index: GithubTreeIndex }
>();

export function invalidateGithubTreeCache(
  repo?: string,
  branch?: string
): void {
  if (!repo) {
    treeCache.clear();
    return;
  }
  const parsed = parseGithubRepo(repo);
  const ownerRepo = parsed ? `${parsed.owner}/${parsed.repo}` : repo.trim();
  if (!branch) {
    for (const key of [...treeCache.keys()]) {
      if (key.startsWith(`${ownerRepo}#`)) treeCache.delete(key);
    }
    return;
  }
  treeCache.delete(`${ownerRepo}#${branch}`);
}

function encodeGithubContentPath(path: string): string {
  return path
    .replace(/^\/+/, "")
    .split("/")
    .filter(Boolean)
    .map(encodeURIComponent)
    .join("/");
}

/** Decode a GitHub Contents API payload (base64, possibly wrapped). */
export function decodeGithubFileContent(
  content: string,
  encoding?: string
): string {
  if (encoding && encoding !== "base64") return content;
  const raw = content.replace(/\s+/g, "");
  const bytes = Uint8Array.from(atob(raw), (c) => c.charCodeAt(0));
  return new TextDecoder("utf-8").decode(bytes);
}

type GitTreePayload = {
  sha: string;
  truncated?: boolean;
  tree?: Array<{ path?: string; type?: string }>;
};

export async function fetchGithubTreeIndex(input: {
  token: string;
  repo: string;
  branch: string;
}): Promise<GithubTreeIndex> {
  const parsed = parseGithubRepo(input.repo);
  if (!parsed) {
    throw new Error('Repo must look like "owner/repo".');
  }
  const branch = (input.branch || "main").trim() || "main";
  const cacheKey = `${parsed.owner}/${parsed.repo}#${branch}`;
  const cached = treeCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) return cached.index;

  const base = `/repos/${parsed.owner}/${parsed.repo}`;
  const ref = await githubFetch<GitRef>(
    input.token,
    `${base}/git/ref/heads/${encodeURIComponent(branch)}`
  );
  const commit = await githubFetch<GitCommit>(
    input.token,
    `${base}/git/commits/${ref.object.sha}`
  );
  const tree = await githubFetch<GitTreePayload>(
    input.token,
    `${base}/git/trees/${commit.tree.sha}?recursive=1`
  );
  const index: GithubTreeIndex = {
    blobs: [],
    trees: [],
    truncated: Boolean(tree.truncated),
  };
  for (const item of tree.tree ?? []) {
    if (!item.path) continue;
    if (item.type === "blob") index.blobs.push(item.path);
    else if (item.type === "tree") index.trees.push(item.path);
  }
  treeCache.set(cacheKey, { expires: Date.now() + TREE_TTL_MS, index });
  return index;
}

type ContentPayload = {
  type: string;
  encoding?: string;
  content?: string;
  path: string;
};

export async function fetchGithubFileContent(input: {
  token: string;
  repo: string;
  branch: string;
  path: string;
}): Promise<string | null> {
  const parsed = parseGithubRepo(input.repo);
  if (!parsed) {
    throw new Error('Repo must look like "owner/repo".');
  }
  const branch = (input.branch || "main").trim() || "main";
  const path = encodeGithubContentPath(input.path);
  if (!path) return null;
  const base = `/repos/${parsed.owner}/${parsed.repo}`;
  try {
    const data = await githubFetch<ContentPayload>(
      input.token,
      `${base}/contents/${path}?ref=${encodeURIComponent(branch)}`
    );
    if (data.type !== "file" || typeof data.content !== "string") return null;
    return decodeGithubFileContent(data.content, data.encoding);
  } catch (error) {
    if (error instanceof GithubApiError && error.status === 404) return null;
    throw error;
  }
}

type GitRef = { object: { sha: string } };
type GitCommit = { sha: string; tree: { sha: string }; html_url?: string };
type GitBlob = { sha: string };
type GitTree = { sha: string };
type RepoInfo = { default_branch: string; html_url: string };

export async function pushFilesToGithub(input: {
  token: string;
  repo: string;
  branch: string;
  files: GithubFile[];
  message: string;
}): Promise<GithubPushResult> {
  if (input.files.length === 0) {
    throw new Error("Nothing to push.");
  }
  const parsed = parseGithubRepo(input.repo);
  if (!parsed) {
    throw new Error('Repo must look like "owner/repo".');
  }
  const branch = (input.branch || "main").trim() || "main";
  const { owner, repo } = parsed;
  const base = `/repos/${owner}/${repo}`;

  const repoInfo = await githubFetch<RepoInfo>(input.token, base);

  let parentSha: string | null = null;
  let baseTree: string | null = null;
  try {
    const ref = await githubFetch<GitRef>(
      input.token,
      `${base}/git/ref/heads/${encodeURIComponent(branch)}`
    );
    parentSha = ref.object.sha;
  } catch (error) {
    if (!(error instanceof GithubApiError) || error.status !== 404) {
      throw error;
    }
    // Branch missing: try default branch as parent, then create this branch.
    if (repoInfo.default_branch && repoInfo.default_branch !== branch) {
      try {
        const ref = await githubFetch<GitRef>(
          input.token,
          `${base}/git/ref/heads/${encodeURIComponent(repoInfo.default_branch)}`
        );
        parentSha = ref.object.sha;
      } catch {
        parentSha = null;
      }
    }
  }

  if (parentSha) {
    const commit = await githubFetch<GitCommit>(
      input.token,
      `${base}/git/commits/${parentSha}`
    );
    baseTree = commit.tree.sha;
  }

  const treeItems: Array<{
    path: string;
    mode: "100644";
    type: "blob";
    sha: string;
  }> = [];

  for (const file of input.files) {
    const blob = await githubFetch<GitBlob>(input.token, `${base}/git/blobs`, {
      method: "POST",
      body: JSON.stringify({
        content: file.content,
        encoding: "utf-8",
      }),
    });
    treeItems.push({
      path: file.path.replace(/^\/+/, ""),
      mode: "100644",
      type: "blob",
      sha: blob.sha,
    });
  }

  const tree = await githubFetch<GitTree>(input.token, `${base}/git/trees`, {
    method: "POST",
    body: JSON.stringify({
      ...(baseTree ? { base_tree: baseTree } : {}),
      tree: treeItems,
    }),
  });

  const commit = await githubFetch<GitCommit>(
    input.token,
    `${base}/git/commits`,
    {
      method: "POST",
      body: JSON.stringify({
        message: input.message,
        tree: tree.sha,
        parents: parentSha ? [parentSha] : [],
      }),
    }
  );

  if (parentSha) {
    try {
      await githubFetch(input.token, `${base}/git/refs/heads/${encodeURIComponent(branch)}`, {
        method: "PATCH",
        body: JSON.stringify({ sha: commit.sha }),
      });
    } catch (error) {
      if (!(error instanceof GithubApiError) || error.status !== 404) {
        throw error;
      }
      await githubFetch(input.token, `${base}/git/refs`, {
        method: "POST",
        body: JSON.stringify({
          ref: `refs/heads/${branch}`,
          sha: commit.sha,
        }),
      });
    }
  } else {
    await githubFetch(input.token, `${base}/git/refs`, {
      method: "POST",
      body: JSON.stringify({
        ref: `refs/heads/${branch}`,
        sha: commit.sha,
      }),
    });
  }

  invalidateGithubTreeCache(`${owner}/${repo}`, branch);

  return {
    owner,
    repo,
    branch,
    commitSha: commit.sha,
    fileCount: input.files.length,
    htmlUrl:
      commit.html_url ||
      `https://github.com/${owner}/${repo}/commit/${commit.sha}`,
  };
}

export function requireRepoRef(repo: string): GithubRepoRef {
  const parsed = parseGithubRepo(repo);
  if (!parsed) {
    throw new Error('Repo must look like "owner/repo".');
  }
  return parsed;
}
