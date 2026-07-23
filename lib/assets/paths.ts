/** Storage bucket for essay images and Library PDFs (public-by-URL). */
export const ASSETS_BUCKET = "assets";

/**
 * Extract the Storage object path from a public (or signed) Supabase assets URL
 * belonging to `userId`, or null if the URL is not one of ours.
 */
export function assetPathFromUrl(
  url: string,
  userId: string
): string | null {
  try {
    const parsed = new URL(url);
    // …/storage/v1/object/public/assets/<path>
    // …/storage/v1/object/sign/assets/<path>?token=…
    const marker = `/object/public/${ASSETS_BUCKET}/`;
    const signMarker = `/object/sign/${ASSETS_BUCKET}/`;
    let path: string | null = null;
    const publicIdx = parsed.pathname.indexOf(marker);
    if (publicIdx >= 0) {
      path = decodeURIComponent(parsed.pathname.slice(publicIdx + marker.length));
    } else {
      const signIdx = parsed.pathname.indexOf(signMarker);
      if (signIdx >= 0) {
        path = decodeURIComponent(
          parsed.pathname.slice(signIdx + signMarker.length)
        );
      }
    }
    if (!path) return null;
    const prefix = `${userId}/`;
    if (!path.startsWith(prefix)) return null;
    return path;
  } catch {
    return null;
  }
}

/** Collect unique owned asset paths referenced in markdown image URLs. */
export function collectOwnedAssetPaths(
  markdown: string,
  userId: string
): string[] {
  const found = new Set<string>();
  const re = /!\[[^\]]*]\(\s*<?([^>\s)]+)>?/g;
  for (const match of markdown.matchAll(re)) {
    const path = assetPathFromUrl(match[1], userId);
    if (path) found.add(path);
  }
  return [...found];
}
