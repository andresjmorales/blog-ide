import { assetPathFromUrl } from "@/lib/assets/paths";

const IMAGE_URL_RE = /(!\[[^\]]*]\(\s*<?)([^>\s)]+)(>?)/g;

/** Storage paths of the owner's images referenced by the essay. */
export function ownerImagePaths(markdown: string, ownerId: string): string[] {
  const found = new Set<string>();
  for (const match of markdown.matchAll(IMAGE_URL_RE)) {
    const path = assetPathFromUrl(match[2], ownerId);
    if (path) found.add(path);
  }
  return [...found];
}

/** Swap the owner's image URLs for URLs an invitee can load. */
export function rewriteOwnerImageUrls(
  markdown: string,
  ownerId: string,
  signed: Map<string, string>
): string {
  if (signed.size === 0) return markdown;
  return markdown.replace(
    IMAGE_URL_RE,
    (full, prefix: string, url: string, suffix: string) => {
      const path = assetPathFromUrl(url, ownerId);
      const next = path ? signed.get(path) : undefined;
      return next ? `${prefix}${next}${suffix}` : full;
    }
  );
}
