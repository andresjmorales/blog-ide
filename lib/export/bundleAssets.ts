import { ASSETS_BUCKET, assetPathFromUrl } from "@/lib/assets/paths";
import { createClient } from "@/lib/supabase/client";

const IMAGE_MD_RE = /!\[([^\]]*)]\(\s*<?([^>\s)]+)>?(?:\s+"[^"]*")?\s*\)/g;

export type BundledAsset = {
  /** Path inside the zip, e.g. assets/123-cover.webp */
  zipPath: string;
  data: Uint8Array;
};

/**
 * Download owned Supabase assets referenced in markdown and rewrite links to
 * relative `assets/<filename>` paths. External URLs are left alone.
 */
export async function bundleOwnedAssetsInMarkdown(
  markdown: string,
  userId: string,
  usedZipNames: Set<string>
): Promise<{ markdown: string; assets: BundledAsset[] }> {
  const supabase = createClient();
  const assets: BundledAsset[] = [];
  const pathToZip = new Map<string, string>();

  const matches = [...markdown.matchAll(IMAGE_MD_RE)];
  for (const match of matches) {
    const url = match[2];
    const storagePath = assetPathFromUrl(url, userId);
    if (!storagePath || pathToZip.has(storagePath)) continue;

    const baseName =
      storagePath.split("/").pop()?.replace(/[^\w.\-]+/g, "_") || "asset.bin";
    let zipName = baseName;
    for (let n = 2; usedZipNames.has(zipName.toLowerCase()); n++) {
      const dot = baseName.lastIndexOf(".");
      zipName =
        dot > 0
          ? `${baseName.slice(0, dot)}-${n}${baseName.slice(dot)}`
          : `${baseName}-${n}`;
    }
    usedZipNames.add(zipName.toLowerCase());

    const { data, error } = await supabase.storage
      .from(ASSETS_BUCKET)
      .download(storagePath);
    if (error || !data) continue;

    const buffer = new Uint8Array(await data.arrayBuffer());
    const zipPath = `assets/${zipName}`;
    pathToZip.set(storagePath, zipPath);
    assets.push({ zipPath, data: buffer });
  }

  if (pathToZip.size === 0) {
    return { markdown, assets };
  }

  const rewritten = markdown.replace(IMAGE_MD_RE, (full, alt, url) => {
    const storagePath = assetPathFromUrl(url, userId);
    if (!storagePath) return full;
    const zipPath = pathToZip.get(storagePath);
    if (!zipPath) return full;
    return `![${alt}](${zipPath})`;
  });

  return { markdown: rewritten, assets };
}
