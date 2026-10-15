import { getLocalDoc } from "@/lib/db/indexed";
import {
  BACKUP_MANIFEST_PATH,
  emptyBackupManifest,
} from "@/lib/export/backupManifest";
import { bundleOwnedAssetsInMarkdown } from "@/lib/export/bundleAssets";
import { buildZip, type ZipEntry } from "@/lib/export/zip";
import {
  absolutizeSiteRelativeMarkdown,
  essaySiteUrlForMarkdown,
  listSiteRelativePaths,
} from "@/lib/siteRelative";
import { createClient } from "@/lib/supabase/client";
import { decryptTreeNames, nodesWithDisplayNames } from "@/lib/vault/names";
import { getVaultNode } from "@/lib/vault/membership";
import { getVaultKeys } from "@/lib/vault/session";
import { listAllDocumentBodies, listWorkspaceNodes } from "@/lib/workspace/api";
import { collectSubtreeIds, getTrashNode } from "@/lib/workspace/tree";
import type { WorkspaceNode } from "@/lib/workspace/types";

export function sanitizeSegment(name: string): string {
  const safe = name.replace(/[\\/:*?"<>|]+/g, "-").trim();
  return safe || "untitled";
}

/**
 * Archive path for every document outside the Trash: folder chain + file
 * name, `.md` enforced, name collisions deduped with " (n)".
 */
export function exportPathsFor(
  nodes: WorkspaceNode[],
  options?: { excludeIds?: Iterable<string> }
): Map<string, string> {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const trash = getTrashNode(nodes);
  const excluded = new Set(trash ? collectSubtreeIds(trash.id, nodes) : []);
  for (const id of options?.excludeIds ?? []) excluded.add(id);

  const paths = new Map<string, string>();
  const used = new Set<string>();

  for (const node of nodes) {
    if (node.kind !== "document" || excluded.has(node.id)) continue;

    const segments: string[] = [];
    let walk = node.parent_id;
    while (walk) {
      const parent = byId.get(walk);
      if (!parent) break;
      segments.unshift(sanitizeSegment(parent.name));
      walk = parent.parent_id;
    }

    let file = sanitizeSegment(node.name);
    if (!file.toLowerCase().endsWith(".md")) file += ".md";
    const stem = file.slice(0, -3);

    let path = [...segments, file].join("/");
    for (let n = 2; used.has(path.toLowerCase()); n++) {
      path = [...segments, `${stem} (${n}).md`].join("/");
    }
    used.add(path.toLowerCase());
    paths.set(node.id, path);
  }

  return paths;
}

export type WorkspaceExportSnapshot = {
  /** Every node, with vault names decrypted when the vault is unlocked. */
  nodes: WorkspaceNode[];
  /** Node ids left out of the export (a locked vault). */
  excludeIds: Set<string>;
  /** Archive path of every exported essay, by node id. */
  paths: Map<string, string>;
  userId: string | null;
  /** The essay as it would be exported: an unsynced local draft wins. */
  markdownFor: (nodeId: string) => Promise<string>;
};

/** The workspace as "Export all essays" sees it. */
export async function loadWorkspaceExportSnapshot(): Promise<WorkspaceExportSnapshot> {
  const nodes = await listWorkspaceNodes();
  const vault = getVaultNode(nodes);
  const keys = getVaultKeys();
  const excludeIds = new Set<string>();
  if (vault && !keys) {
    for (const id of collectSubtreeIds(vault.id, nodes)) excludeIds.add(id);
  }
  const names = keys ? await decryptTreeNames(nodes, keys.dek) : new Map();
  const displayNodes = nodesWithDisplayNames(nodes, names);
  const paths = exportPathsFor(displayNodes, { excludeIds });
  const remote = await listAllDocumentBodies();
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return {
    nodes: displayNodes,
    excludeIds,
    paths,
    userId: user?.id ?? null,
    markdownFor: async (nodeId) => {
      const local = await getLocalDoc(nodeId);
      return local?.dirty
        ? local.markdown
        : (remote.get(nodeId) ?? local?.markdown ?? "");
    },
  };
}

/**
 * Bundle every document (Trash excluded) into a ZIP. Owned Supabase Storage
 * images are downloaded into `assets/` and markdown links rewritten to
 * relative paths. Site-relative links and images become full URLs on the
 * essay's main site (`main_site:`, else `siteUrl`), like every other export.
 * `blogide-backup.json` records both rewrites so an import can undo them.
 * Unsynced local drafts win over the cloud copy.
 */
export async function exportWorkspaceZip(options: { siteUrl?: string } = {}): Promise<{
  blob: Blob;
  fileCount: number;
}> {
  const { paths, userId, markdownFor } = await loadWorkspaceExportSnapshot();
  const encoder = new TextEncoder();
  const entries: ZipEntry[] = [];
  const usedAssetNames = new Set<string>();
  const manifest = emptyBackupManifest();
  let essayCount = 0;

  for (const [nodeId, path] of paths) {
    let markdown = await markdownFor(nodeId);

    if (userId) {
      const bundled = await bundleOwnedAssetsInMarkdown(
        markdown,
        userId,
        usedAssetNames
      );
      markdown = bundled.markdown;
      for (const asset of bundled.assets) {
        entries.push({ path: asset.zipPath, data: asset.data });
        manifest.assets[asset.zipPath] = asset.storagePath;
      }
    }

    const siteUrl = essaySiteUrlForMarkdown(markdown, options.siteUrl ?? "");
    const sitePaths = siteUrl ? listSiteRelativePaths(markdown) : [];
    if (sitePaths.length > 0) {
      markdown = absolutizeSiteRelativeMarkdown(markdown, siteUrl);
      manifest.documents[path] = { siteUrl, sitePaths: [...new Set(sitePaths)] };
    }

    entries.push({ path, data: encoder.encode(markdown) });
    essayCount += 1;
  }

  if (essayCount > 0) {
    entries.push({
      path: BACKUP_MANIFEST_PATH,
      data: encoder.encode(JSON.stringify(manifest, null, 2)),
    });
  }

  const blob = new Blob([buildZip(entries) as BlobPart], {
    type: "application/zip",
  });
  return { blob, fileCount: essayCount };
}

/** Download the whole workspace as blogide-export-YYYY-MM-DD.zip. */
export async function downloadWorkspaceZip(
  options: { siteUrl?: string } = {}
): Promise<number> {
  const { blob, fileCount } = await exportWorkspaceZip(options);
  const stamp = new Date().toISOString().slice(0, 10);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `blogide-export-${stamp}.zip`;
  anchor.click();
  URL.revokeObjectURL(url);
  return fileCount;
}
