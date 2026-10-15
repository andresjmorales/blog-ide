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
};

export function emptyBackupManifest(exportedAt = new Date()): BackupManifest {
  return {
    format: BACKUP_FORMAT,
    version: 1,
    exportedAt: exportedAt.toISOString(),
    documents: {},
    assets: {},
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
    return {
      format: BACKUP_FORMAT,
      version: 1,
      exportedAt: typeof raw.exportedAt === "string" ? raw.exportedAt : "",
      documents,
      assets,
    };
  } catch {
    return null;
  }
}
