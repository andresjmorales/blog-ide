/** Share tokens are 64 lowercase hex characters (two UUIDs, dashes removed). */
const SHARE_TOKEN_RE = /^[0-9a-f]{64}$/;

export function isShareToken(value: unknown): value is string {
  return typeof value === "string" && SHARE_TOKEN_RE.test(value);
}

/** `/s/<token>` → token, for login/signup screens reached from a share link. */
export function shareTokenFromNextPath(
  next: string | null | undefined
): string | null {
  if (!next) return null;
  const match = /^\/s\/([^/?#]+)/.exec(next);
  if (!match) return null;
  let token: string;
  try {
    token = decodeURIComponent(match[1]);
  } catch {
    return null;
  }
  return isShareToken(token) ? token : null;
}

export function shareViewerPath(token: string): string {
  return `/s/${encodeURIComponent(token)}`;
}

export function inviteSignupHref(token: string): string {
  const params = new URLSearchParams({
    invite: token,
    next: shareViewerPath(token),
  });
  return `/signup?${params.toString()}`;
}
