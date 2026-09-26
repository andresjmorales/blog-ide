import { ASSETS_BUCKET, assetPathFromUrl } from "@/lib/assets/paths";
import { AVATAR_OBJECT_NAME } from "@/lib/avatar/constants";

/** Re-signed on every editor load, so this only needs to outlast a session. */
export const AVATAR_SIGNED_URL_TTL_SEC = 60 * 60 * 24 * 7;

export function avatarStoragePath(userId: string): string {
  return `${userId}/${AVATAR_OBJECT_NAME}`;
}

export type AvatarSource =
  | { kind: "path"; path: string }
  | { kind: "url"; url: string };

/**
 * Where the profile photo lives, from user metadata. The assets bucket is
 * private, so our own uploads resolve to a Storage path that must be signed
 * before display. `avatar_path` is written by uploads; older accounts only
 * have an `avatar_url` pointing at the (now dead) public object URL, which
 * maps back to the same path. Any other URL (an OAuth provider's photo) is
 * used as-is.
 */
export function avatarSourceFromMetadata(
  meta: Record<string, unknown> | undefined,
  userId: string
): AvatarSource | null {
  const storedPath =
    typeof meta?.avatar_path === "string" ? meta.avatar_path.trim() : "";
  if (storedPath && storedPath.startsWith(`${userId}/`)) {
    return { kind: "path", path: storedPath };
  }
  const url = typeof meta?.avatar_url === "string" ? meta.avatar_url.trim() : "";
  if (!url) return null;
  const owned = assetPathFromUrl(url, userId);
  if (owned) return { kind: "path", path: owned };
  return { kind: "url", url };
}

export { ASSETS_BUCKET as AVATARS_BUCKET };
