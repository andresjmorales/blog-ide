/**
 * `blogide-backup.json` at the root of an "Export all essays" zip. The
 * essays in the zip are written for reading anywhere (site-relative paths
 * on the main site, uploaded images in `assets/`); the manifest records
 * what was changed so an import can put each essay back as it was stored.
 */

export const BACKUP_MANIFEST_PATH = "blogide-backup.json";
export const BACKUP_FORMAT = "blogide-backup";

export type BackupDocument = {
  /** Site the essay's site-relative paths were written against, if any. */
  siteUrl?: string;
  /** Site-relative paths that were written as `siteUrl` + path. */
  sitePaths?: string[];
};

export type BackupManifest = {
  format: typeof BACKUP_FORMAT;
  version: 1;
  exportedAt: string;
  /** Archive path of each essay → how it was rewritten on export. */
  documents: Record<string, BackupDocument>;
  /** `assets/<file>` → the Storage path it was downloaded from. */
  assets: Record<string, string>;
  /**
   * `site-images/<host>/<path>` → the site-relative path it was downloaded
   * from (`/writing/…`), when the export included images from the site.
   */
  siteImages: Record<string, string>;
};

export function emptyBackupManifest(exportedAt = new Date()): BackupManifest {
  return {
    format: BACKUP_FORMAT,
    version: 1,
    exportedAt: exportedAt.toISOString(),
    documents: {},
    assets: {},
    siteImages: {},
  };
}

/** The manifest from a zip, or null for an older or foreign archive. */
export function parseBackupManifest(text: string | null): BackupManifest | null {
  if (!text) return null;
  try {
    const raw = JSON.parse(text) as Partial<BackupManifest> | null;
    if (!raw || raw.format !== BACKUP_FORMAT) return null;
    const documents =
      raw.documents && typeof raw.documents === "object" ? raw.documents : {};
    const assets = raw.assets && typeof raw.assets === "object" ? raw.assets : {};
    const siteImages =
      raw.siteImages && typeof raw.siteImages === "object" ? raw.siteImages : {};
    return {
      format: BACKUP_FORMAT,
      version: 1,
      exportedAt: typeof raw.exportedAt === "string" ? raw.exportedAt : "",
      documents,
      assets,
      siteImages,
    };
  } catch {
    return null;
  }
}

/**
 * Where an image from the writer's site goes in the zip: its path on the
 * site under `site-images/<host>`, so the folder can be copied to a new host
 * as-is. `/writing/a%20b.webp?v=2` → `site-images/example.com/writing/a b.webp`.
 */
export function siteImageZipPath(siteUrl: string, sitePath: string): string {
  const host = new URL(siteUrl).host;
  const bare = sitePath.split(/[?#]/)[0];
  let decoded = bare;
  try {
    decoded = decodeURIComponent(bare);
  } catch {
    // keep the path as written
  }
  const segments = decoded
    .split("/")
    .filter((part) => part && part !== "." && part !== "..");
  return ["site-images", host, ...segments].join("/");
}

/** The link to `zipPath` as written in an essay at `essayPath`. */
export function zipLinkFrom(essayPath: string, zipPath: string): string {
  const depth = essayPath.split("/").length - 1;
  const link = zipPath.split("/").map(encodeURIComponent).join("/");
  return "../".repeat(depth) + link;
}
