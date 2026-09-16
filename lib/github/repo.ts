/** Parse `owner/repo` or a github.com URL into owner + repo name. */

const REPO_RE = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/;

export type GithubRepoRef = {
  owner: string;
  repo: string;
};

export function parseGithubRepo(input: string): GithubRepoRef | null {
  let trimmed = input.trim();
  if (!trimmed) return null;
  trimmed = trimmed.replace(/^https?:\/\/github\.com\//i, "");
  trimmed = trimmed.replace(/\.git$/i, "");
  trimmed = trimmed.replace(/\/+$/, "");
  const match = trimmed.match(REPO_RE);
  if (!match) return null;
  if (match[1] === "." || match[2] === "." || match[2] === "..") return null;
  return { owner: match[1], repo: match[2] };
}

export function formatGithubRepo(ref: GithubRepoRef): string {
  return `${ref.owner}/${ref.repo}`;
}

/** Join repo-relative path segments; drops empties, `.`, and `..`. */
export function joinGithubPath(...parts: string[]): string {
  const segments: string[] = [];
  for (const part of parts) {
    for (const raw of part.split("/")) {
      const segment = raw.trim();
      if (!segment || segment === ".") continue;
      if (segment === "..") {
        segments.pop();
        continue;
      }
      segments.push(segment.replace(/^[\\]+/, ""));
    }
  }
  return segments.join("/");
}

export function sanitizeGithubFileName(name: string): string {
  const safe = name.replace(/[\\/:*?"<>|]+/g, "-").trim();
  return safe || "untitled";
}

export function ensureMarkdownFileName(name: string): string {
  const safe = sanitizeGithubFileName(name);
  return safe.toLowerCase().endsWith(".md") ? safe : `${safe}.md`;
}

export const GITHUB_DOCUMENT_PATH_HINT =
  "Exact .md file, e.g. drafts/new-essay.md. First push creates it if missing.";

export const GITHUB_FOLDER_PATH_HINT =
  "Directory prefix, e.g. content/essays. Essays inside keep their file names.";

export function isMarkdownGithubPath(path: string): boolean {
  return normalizeGithubPath(path).toLowerCase().endsWith(".md");
}

/**
 * Document maps must be a markdown file, never a folder prefix.
 * Mapping `drafts` as a file would replace that GitHub directory.
 */
export function requireGithubDocumentPath(path: string): string {
  const normalized = normalizeGithubPath(path);
  if (!normalized) {
    throw new Error(
      "Enter a file path ending in .md, for example drafts/new-essay.md."
    );
  }
  if (!isMarkdownGithubPath(normalized)) {
    throw new Error(
      "Essay mappings must be a .md file, not a folder. Use a path like drafts/new-essay.md. First push creates the file if it does not exist yet."
    );
  }
  return normalized;
}

/** Repo-relative path without a leading or trailing slash. */
export function normalizeGithubPath(path: string): string {
  return path.replace(/^\/+|\/+$/g, "");
}

export function githubBasename(path: string): string {
  const parts = normalizeGithubPath(path).split("/").filter(Boolean);
  return parts[parts.length - 1] ?? "";
}
