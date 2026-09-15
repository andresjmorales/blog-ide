import { createClient } from "@/lib/supabase/client";
import { ASSETS_BUCKET, assetPathFromUrl } from "@/lib/assets/paths";

/** One day — long enough for an editing session; refresh before it lapses. */
export const ASSET_SIGNED_URL_TTL_SEC = 60 * 60 * 24;

/** Re-sign when less than this remains on a stored URL. */
export const ASSET_SIGNED_URL_REFRESH_SEC = 60 * 60 * 4;

export async function createAssetSignedUrl(
  path: string,
  expiresIn = ASSET_SIGNED_URL_TTL_SEC
): Promise<string> {
  const supabase = createClient();
  const signed = await supabase.storage
    .from(ASSETS_BUCKET)
    .createSignedUrl(path, expiresIn);
  if (signed.error || !signed.data?.signedUrl) {
    throw signed.error ?? new Error("Could not create a signed asset URL");
  }
  return signed.data.signedUrl;
}

export async function createAssetSignedUrls(
  paths: string[],
  expiresIn = ASSET_SIGNED_URL_TTL_SEC
): Promise<Map<string, string>> {
  const unique = [...new Set(paths.filter(Boolean))];
  const out = new Map<string, string>();
  if (unique.length === 0) return out;
  const supabase = createClient();
  const signed = await supabase.storage
    .from(ASSETS_BUCKET)
    .createSignedUrls(unique, expiresIn);
  if (signed.error) throw signed.error;
  for (const row of signed.data ?? []) {
    if (row.path && row.signedUrl && !row.error) {
      out.set(row.path, row.signedUrl);
    }
  }
  return out;
}

/** JWT `exp` (seconds) from a Supabase signed URL, or null if not a JWT. */
export function signedUrlExpirySec(url: string): number | null {
  try {
    const token = new URL(url).searchParams.get("token");
    if (!token) return null;
    const payload = token.split(".")[1];
    if (!payload) return null;
    const json = JSON.parse(base64UrlToUtf8(payload)) as { exp?: unknown };
    return typeof json.exp === "number" ? json.exp : null;
  } catch {
    return null;
  }
}

export function signedUrlNeedsRefresh(
  url: string,
  nowSec = Math.floor(Date.now() / 1000)
): boolean {
  if (url.includes(`/object/public/${ASSETS_BUCKET}/`)) return true;
  const exp = signedUrlExpirySec(url);
  if (exp == null) return false;
  return exp - nowSec <= ASSET_SIGNED_URL_REFRESH_SEC;
}

/**
 * Replace owned public URLs and soon-to-expire signed URLs with fresh
 * signed URLs. Returns the original markdown when nothing needs updating.
 */
export async function refreshOwnedAssetUrls(
  markdown: string,
  userId: string
): Promise<string> {
  const re = /(!\[[^\]]*]\(\s*<?)([^>\s)]+)(>?)/g;
  const needed = new Set<string>();
  for (const match of markdown.matchAll(re)) {
    const url = match[2];
    const path = assetPathFromUrl(url, userId);
    if (path && signedUrlNeedsRefresh(url)) needed.add(path);
  }
  if (needed.size === 0) return markdown;
  const fresh = await createAssetSignedUrls([...needed]);
  if (fresh.size === 0) return markdown;
  return markdown.replace(re, (full, prefix: string, url: string, suffix: string) => {
    const path = assetPathFromUrl(url, userId);
    if (!path) return full;
    const next = fresh.get(path);
    return next ? `${prefix}${next}${suffix}` : full;
  });
}

function base64UrlToUtf8(b64url: string): string {
  const padded = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  return atob(padded + pad);
}
