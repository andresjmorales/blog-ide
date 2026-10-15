import { createAssetSignedUrl, ESSAY_IMAGE_SIGNED_URL_TTL_SEC } from "@/lib/assets/signedUrls";
import { uploadUserAsset } from "@/lib/assets/upload";
import { parseBackupManifest } from "@/lib/export/backupManifest";
import {
  backupCopyName,
  bundledAssetPaths,
  planBackupImport,
  readBackupArchive,
  relinkBundledAssets,
  type BackupArchive,
  type PlannedBackupDocument,
} from "@/lib/export/backupImportPlan";
import { readZip } from "@/lib/export/unzip";
import {
  loadWorkspaceExportSnapshot,
  sanitizeSegment,
  type WorkspaceExportSnapshot,
} from "@/lib/export/workspaceZip";
import { vaultSubtreeIds } from "@/lib/vault/membership";
import { getVaultKeys } from "@/lib/vault/session";
import { createWorkspaceNode } from "@/lib/workspace/api";
import { collectSubtreeIds, getTrashNode, uniqueSiblingName } from "@/lib/workspace/tree";
import type { WorkspaceNode } from "@/lib/workspace/types";

export type PreparedBackupImport = {
  archive: BackupArchive;
  snapshot: WorkspaceExportSnapshot;
  plan: PlannedBackupDocument[];
  counts: { create: number; unchanged: number; copy: number };
};

export type BackupImportResult = {
  created: number;
  copies: number;
  unchanged: number;
  /** Essays bound for a locked vault. */
  skippedVault: number;
  /** Bundled images that could not be restored (left as `assets/…`). */
  missingImages: number;
};

/** Read a backup zip and work out what importing it would do. */
export async function prepareBackupImport(file: File): Promise<PreparedBackupImport> {
  const entries = await readZip(new Uint8Array(await file.arrayBuffer()));
  const archive = readBackupArchive(entries, parseBackupManifest);
  if (archive.documents.length === 0) {
    throw new Error("No essays (.md files) in that archive.");
  }
  const snapshot = await loadWorkspaceExportSnapshot();
  const existing = new Map<string, string>();
  for (const [nodeId, path] of snapshot.paths) {
    existing.set(path.toLowerCase(), await snapshot.markdownFor(nodeId));
  }
  const plan = planBackupImport(archive, existing, snapshot.userId);
  const counts = { create: 0, unchanged: 0, copy: 0 };
  for (const doc of plan) counts[doc.action] += 1;
  return { archive, snapshot, plan, counts };
}

const IMAGE_TYPES: Record<string, string> = {
  avif: "image/avif",
  gif: "image/gif",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  png: "image/png",
  svg: "image/svg+xml",
  webp: "image/webp",
};

function imageType(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return IMAGE_TYPES[ext] ?? "application/octet-stream";
}

/**
 * Create the new essays and the copies of changed ones, with their folders.
 * Bundled images reuse the original upload when it is still in this
 * account's Storage, and are uploaded again otherwise.
 */
export async function applyBackupImport(
  prepared: PreparedBackupImport
): Promise<BackupImportResult> {
  const { archive, snapshot } = prepared;
  const result: BackupImportResult = {
    created: 0,
    copies: 0,
    unchanged: prepared.counts.unchanged,
    skippedVault: 0,
    missingImages: 0,
  };

  // Tree as names go: grows as folders and essays are created.
  const tree: WorkspaceNode[] = [...snapshot.nodes];
  const trash = getTrashNode(tree);
  const inTrash = new Set(trash ? collectSubtreeIds(trash.id, tree) : []);
  const vaultIds = vaultSubtreeIds(tree);
  const vaultUnlocked = Boolean(getVaultKeys());

  // Folder path (lowercase, as the export names folders) → folder id.
  const folders = new Map<string, string>();
  const byId = new Map(tree.map((n) => [n.id, n]));
  const folderPath = (node: WorkspaceNode): string => {
    const segments: string[] = [];
    let walk: WorkspaceNode | undefined = node;
    while (walk) {
      segments.unshift(sanitizeSegment(walk.name));
      walk = walk.parent_id ? byId.get(walk.parent_id) : undefined;
    }
    return segments.join("/").toLowerCase();
  };
  // A locked vault stays in the map so its essays are skipped, never
  // recreated in a plain folder of the same name.
  for (const node of tree) {
    if (node.kind !== "folder" || inTrash.has(node.id)) continue;
    const key = folderPath(node);
    if (!folders.has(key)) folders.set(key, node.id);
  }

  const addToTree = (
    id: string,
    kind: WorkspaceNode["kind"],
    name: string,
    parentId: string | null
  ) => {
    tree.push({ id, kind, name, parent_id: parentId } as WorkspaceNode);
    if (parentId && vaultIds.has(parentId)) vaultIds.add(id);
  };

  /** Folder id for the archive folders, or undefined when it would enter a locked vault. */
  async function ensureFolder(segments: string[]): Promise<string | null | undefined> {
    let parentId: string | null = null;
    for (let i = 0; i < segments.length; i++) {
      const key = segments.slice(0, i + 1).join("/").toLowerCase();
      const found = folders.get(key);
      if (found) {
        if (vaultIds.has(found) && !vaultUnlocked) return undefined;
        parentId = found;
        continue;
      }
      const encrypt = Boolean(parentId && vaultIds.has(parentId));
      if (encrypt && !vaultUnlocked) return undefined;
      const name = uniqueSiblingName(tree, parentId, segments[i]);
      const id = await createWorkspaceNode({ kind: "folder", name, parentId, encrypt });
      addToTree(id, "folder", name, parentId);
      folders.set(key, id);
      parentId = id;
    }
    return parentId;
  }

  const imageUrls = new Map<string, string>();
  async function imageUrl(zipPath: string): Promise<string | null> {
    const cached = imageUrls.get(zipPath);
    if (cached) return cached;
    let url: string | null = null;
    const storagePath = archive.manifest?.assets[zipPath];
    if (storagePath && snapshot.userId && storagePath.startsWith(`${snapshot.userId}/`)) {
      try {
        url = await createAssetSignedUrl(storagePath, ESSAY_IMAGE_SIGNED_URL_TTL_SEC);
      } catch {
        url = null; // deleted since the backup: upload it again
      }
    }
    const data = archive.assets.get(zipPath);
    if (!url && data) {
      const fileName = (storagePath ?? zipPath).split("/").pop() ?? "image";
      const blob = new Blob([data as BlobPart], { type: imageType(zipPath) });
      url = await uploadUserAsset(blob, fileName.replace(/^\d+-/, ""));
    }
    if (url) imageUrls.set(zipPath, url);
    return url;
  }

  for (const doc of prepared.plan) {
    if (doc.action === "unchanged") continue;
    const segments = doc.path.split("/");
    const fileName = segments.pop() ?? doc.path;
    const parentId = await ensureFolder(segments);
    if (parentId === undefined) {
      result.skippedVault += 1;
      continue;
    }

    const urls = new Map<string, string>();
    for (const zipPath of bundledAssetPaths(doc.markdown)) {
      try {
        const url = await imageUrl(zipPath);
        if (url) urls.set(zipPath, url);
        else result.missingImages += 1;
      } catch {
        result.missingImages += 1;
      }
    }
    const markdown = relinkBundledAssets(doc.markdown, urls);

    const desired = /\.md$/i.test(fileName)
      ? fileName
      : `${fileName.replace(/\.markdown$/i, "")}.md`;
    const name = uniqueSiblingName(
      tree,
      parentId,
      doc.action === "copy"
        ? backupCopyName(desired, archive.manifest?.exportedAt ?? "")
        : desired
    );
    const id = await createWorkspaceNode({
      kind: "document",
      name,
      parentId,
      markdown,
      encrypt: Boolean(parentId && vaultIds.has(parentId)),
    });
    addToTree(id, "document", name, parentId);
    if (doc.action === "copy") result.copies += 1;
    else result.created += 1;
  }

  return result;
}

/** Ask for a .zip backup. */
export function pickBackupZip(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".zip,application/zip";
    input.addEventListener("change", () => resolve(input.files?.[0] ?? null));
    input.click();
  });
}
