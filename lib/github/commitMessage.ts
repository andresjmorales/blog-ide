import { PRODUCT_NAME } from "@/lib/brand";
import { normalizeGithubPath } from "@/lib/github/repo";
import { getPublicSiteUrl } from "@/lib/siteUrl";

const MAX_LISTED_PATHS = 20;

/** Host the user pushed from: this tab’s origin, else the public site URL. */
export function githubPushOriginUrl(): string {
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin.replace(/\/$/, "");
  }
  return getPublicSiteUrl();
}

export function formatGithubPushOrigin(originUrl: string): string {
  const origin = originUrl.trim().replace(/\/$/, "");
  if (!origin) return `via ${PRODUCT_NAME}`;
  return `via ${PRODUCT_NAME} (${origin})`;
}

function normalizedPaths(files: Array<{ path: string }>): string[] {
  const paths: string[] = [];
  for (const file of files) {
    const path = normalizeGithubPath(file.path);
    if (path) paths.push(path);
  }
  return paths;
}

function syncSubject(count: number): string {
  return `blogide: sync ${count} file${count === 1 ? "" : "s"}`;
}

/**
 * Subject keeps `blogide: sync N file(s)`. The body lists paths and records
 * where the push came from, e.g. `via BlogIDE (https://blogide.com)`.
 */
export function githubPushCommitMessage(
  files: Array<{ path: string }>,
  originUrl: string = githubPushOriginUrl()
): string {
  const paths = normalizedPaths(files);
  const origin = formatGithubPushOrigin(originUrl);
  const parts = [syncSubject(paths.length)];

  if (paths.length > 0) {
    const listed = paths.slice(0, MAX_LISTED_PATHS).map((path) => `- ${path}`);
    if (paths.length > MAX_LISTED_PATHS) {
      listed.push(`- …and ${paths.length - MAX_LISTED_PATHS} more`);
    }
    parts.push("", listed.join("\n"));
  }

  parts.push("", origin);
  return parts.join("\n");
}
