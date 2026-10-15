import { assetPathFromUrl } from "@/lib/assets/paths";
import {
  BACKUP_MANIFEST_PATH,
  type BackupManifest,
} from "@/lib/export/backupManifest";
import { relativizeSiteMarkdown } from "@/lib/siteRelative";

/**
 * Pure planning for "Import backup (.zip)": which essays in an archive are
 * new, which are already here unchanged, and which differ from the essay at
 * the same path. Nothing is ever overwritten; a changed essay comes back as
 * a sibling copy. Network work lives in `backupImport.ts`.
 */

export type BackupImportAction = "create" | "unchanged" | "copy";

export type PlannedBackupDocument = {
  /** Path inside the archive (prefix stripped), e.g. `Essays/ordo.md`. */
  path: string;
  action: BackupImportAction;
  /** The essay as stored before export; images may still be `assets/…`. */
  markdown: string;
};

export type BackupArchive = {
  manifest: BackupManifest | null;
  documents: { path: string; markdown: string }[];
  /** `assets/<file>` → bytes. */
  assets: Map<string, Uint8Array>;
};

/** `](assets/…` (behind `../` per folder) in a destination written by the export. */
const BUNDLED_ASSET_RE = /(\]\(\s*<?)(?:\.\.\/)*(assets\/[^\s)>]+)/g;
/** `](site-images/<host>/…` written by an export that included site images. */
const SITE_IMAGE_LINK_RE = /(\]\(\s*<?)(?:\.\.\/)*(site-images\/[^\s)>]+)/g;
/** Destination of any markdown image. */
const IMAGE_DEST_RE = /(!\[[^\]]*\]\(\s*<?)([^\s)>]+)/g;

function isMarkdownPath(path: string): boolean {
  return /\.(md|markdown)$/i.test(path);
}

/** Hidden files and OS clutter (`__MACOSX/`, `.DS_Store`) in a re-zipped folder. */
function isClutter(path: string): boolean {
  return path.split("/").some((part) => part.startsWith(".") || part === "__MACOSX");
}

/**
 * Sort raw zip entries into a backup. A folder that was unzipped and zipped
 * again gains one wrapping directory; it is stripped when the manifest sits
 * in it or it is named like the export (`blogide-export-…`).
 */
export function readBackupArchive(
  entries: { path: string; data: Uint8Array }[],
  parseManifest: (text: string | null) => BackupManifest | null
): BackupArchive {
  const decoder = new TextDecoder();
  const files = entries.filter((entry) => !isClutter(entry.path));
  const manifestEntry = files.find(
    (entry) =>
      entry.path === BACKUP_MANIFEST_PATH ||
      entry.path.endsWith(`/${BACKUP_MANIFEST_PATH}`)
  );
  let prefix = manifestEntry
    ? manifestEntry.path.slice(0, -BACKUP_MANIFEST_PATH.length)
    : "";
  if (!manifestEntry) {
    const markdownPaths = files.map((f) => f.path).filter(isMarkdownPath);
    const firstSegments = new Set(markdownPaths.map((path) => path.split("/")[0]));
    const [only] = [...firstSegments];
    if (
      firstSegments.size === 1 &&
      /^blogide-export/i.test(only) &&
      markdownPaths.every((path) => path.includes("/"))
    ) {
      prefix = `${only}/`;
    }
  }

  const manifest = parseManifest(
    manifestEntry ? decoder.decode(manifestEntry.data) : null
  );
  const documents: BackupArchive["documents"] = [];
  const assets = new Map<string, Uint8Array>();
  for (const entry of files) {
    if (!entry.path.startsWith(prefix) || entry === manifestEntry) continue;
    const path = entry.path.slice(prefix.length);
    if (path.startsWith("assets/")) {
      assets.set(path, entry.data);
    } else if (isMarkdownPath(path)) {
      documents.push({
        path,
        markdown: decoder.decode(entry.data).replace(/^﻿/, ""),
      });
    }
  }
  return { manifest, documents, assets };
}

function decodeLink(link: string): string {
  try {
    return decodeURIComponent(link);
  } catch {
    return link;
  }
}

/** Undo the export's main-site rewrites for one essay. */
export function restoreBackupMarkdown(
  path: string,
  markdown: string,
  manifest: BackupManifest | null
): string {
  if (!manifest) return markdown;
  let restored = markdown.replace(SITE_IMAGE_LINK_RE, (full, lead: string, link: string) => {
    const sitePath = manifest.siteImages[decodeLink(link)];
    return sitePath ? `${lead}${sitePath}` : full;
  });
  const doc = manifest.documents[path];
  if (doc?.siteUrl) {
    restored = relativizeSiteMarkdown(
      restored,
      doc.siteUrl,
      doc.sitePaths ? new Set(doc.sitePaths) : undefined
    );
  }
  return restored;
}

function fileBaseName(path: string): string {
  return (path.split("/").pop() ?? path).replace(/[^\w.\-]+/g, "_");
}

/**
 * The essay with uploaded images reduced to their file names, so a stored
 * essay (signed Storage URLs, re-signed now and then) and its backup
 * (`assets/…`) compare equal when nothing else changed.
 */
export function comparableMarkdown(
  markdown: string,
  userId: string | null,
  manifest: BackupManifest | null
): string {
  return markdown
    .replace(/\r\n/g, "\n")
    .replace(BUNDLED_ASSET_RE, (_m, lead: string, zipPath: string) => {
      const storagePath = manifest?.assets[zipPath];
      return `${lead}asset:${fileBaseName(storagePath ?? zipPath)}`;
    })
    .replace(IMAGE_DEST_RE, (full, lead: string, url: string) => {
      const storagePath = userId ? assetPathFromUrl(url, userId) : null;
      return storagePath ? `${lead}asset:${fileBaseName(storagePath)}` : full;
    })
    .trimEnd();
}

/**
 * Decide what happens to each essay in the archive. `existing` maps the
 * lowercase archive path of every essay already in the workspace (as the
 * export would name it) to its markdown.
 */
export function planBackupImport(
  archive: BackupArchive,
  existing: Map<string, string>,
  userId: string | null
): PlannedBackupDocument[] {
  return archive.documents.map(({ path, markdown: raw }) => {
    const markdown = restoreBackupMarkdown(path, raw, archive.manifest);
    const current = existing.get(path.toLowerCase());
    if (current === undefined) return { path, action: "create", markdown };
    const same =
      comparableMarkdown(current, userId, archive.manifest) ===
      comparableMarkdown(markdown, userId, archive.manifest);
    return { path, action: same ? "unchanged" : "copy", markdown };
  });
}

/** `essay.md` → `essay (backup 2026-10-15).md` for a changed essay's copy. */
export function backupCopyName(fileName: string, exportedAt: string): string {
  const date = /^\d{4}-\d{2}-\d{2}/.exec(exportedAt)?.[0] ?? "";
  const label = date ? `backup ${date}` : "backup";
  const stem = fileName.replace(/\.md$/i, "");
  return `${stem} (${label}).md`;
}

/** Bundled image paths an essay still points at. */
export function bundledAssetPaths(markdown: string): string[] {
  return [...new Set([...markdown.matchAll(BUNDLED_ASSET_RE)].map((m) => m[2]))];
}

/** Point `assets/…` destinations at the uploaded (or still stored) image. */
export function relinkBundledAssets(
  markdown: string,
  urls: Map<string, string>
): string {
  return markdown.replace(BUNDLED_ASSET_RE, (full, lead: string, zipPath: string) => {
    const url = urls.get(zipPath);
    return url ? `${lead}${url}` : full;
  });
}
