import { PRODUCT_NAME } from "@/lib/brand";
import { githubBasename, normalizeGithubPath } from "@/lib/github/repo";
import { getPublicSiteUrl } from "@/lib/siteUrl";

const SUBJECT_PREFIX = "blogide: ";
const SUBJECT_MAX = 72;
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

function subjectForPaths(paths: string[]): string {
  if (paths.length === 1) {
    const path = paths[0];
    const full = `${SUBJECT_PREFIX}${path}`;
    if (full.length <= SUBJECT_MAX) return full;
    return `${SUBJECT_PREFIX}${githubBasename(path) || path}`;
  }
  if (paths.length === 0) return `${SUBJECT_PREFIX}sync`;
  return `${SUBJECT_PREFIX}sync ${paths.length} files`;
}

/**
 * GitHub commit subject names the file (or file count). The body records
 * where the push came from, e.g. `via BlogIDE (https://blogide.com)`.
 */
export function githubPushCommitMessage(
  files: Array<{ path: string }>,
  originUrl: string = githubPushOriginUrl()
): string {
  const paths = normalizedPaths(files);
  const subject = subjectForPaths(paths);
  const origin = formatGithubPushOrigin(originUrl);
  const parts = [subject];

  if (paths.length === 1 && `${SUBJECT_PREFIX}${paths[0]}`.length > SUBJECT_MAX) {
    parts.push("", paths[0]);
  } else if (paths.length > 1) {
    const listed = paths.slice(0, MAX_LISTED_PATHS).map((path) => `- ${path}`);
    if (paths.length > MAX_LISTED_PATHS) {
      listed.push(`- …and ${paths.length - MAX_LISTED_PATHS} more`);
    }
    parts.push("", listed.join("\n"));
  }

  parts.push("", origin);
  return parts.join("\n");
}
