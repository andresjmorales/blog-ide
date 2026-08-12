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
