import { getLocalDoc } from "@/lib/db/indexed";
import { bundleOwnedAssetsInMarkdown } from "@/lib/export/bundleAssets";
import { buildZip, type ZipEntry } from "@/lib/export/zip";
import { createClient } from "@/lib/supabase/client";
import { listAllDocumentBodies, listWorkspaceNodes } from "@/lib/workspace/api";
import { collectSubtreeIds, getTrashNode } from "@/lib/workspace/tree";
import type { WorkspaceNode } from "@/lib/workspace/types";

function sanitizeSegment(name: string): string {
  const safe = name.replace(/[\\/:*?"<>|]+/g, "-").trim();
  return safe || "untitled";
}

/**
 * Archive path for every document outside the Trash: folder chain + file
 * name, `.md` enforced, name collisions deduped with " (n)".
 */
export function exportPathsFor(nodes: WorkspaceNode[]): Map<string, string> {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const trash = getTrashNode(nodes);
  const excluded = new Set(trash ? collectSubtreeIds(trash.id, nodes) : []);

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

/**
 * Bundle every document (Trash excluded) into a ZIP. Owned Supabase Storage
 * images are downloaded into `assets/` and markdown links rewritten to
 * relative paths. Unsynced local drafts win over the cloud copy.
 */
export async function exportWorkspaceZip(): Promise<{
  blob: Blob;
  fileCount: number;
}> {
  const nodes = await listWorkspaceNodes();
  const paths = exportPathsFor(nodes);
  const remote = await listAllDocumentBodies();
  const encoder = new TextEncoder();
  const entries: ZipEntry[] = [];
  const usedAssetNames = new Set<string>();

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const userId = user?.id ?? null;

  for (const [nodeId, path] of paths) {
    const local = await getLocalDoc(nodeId);
    let markdown = local?.dirty
      ? local.markdown
      : (remote.get(nodeId) ?? local?.markdown ?? "");

    if (userId) {
      const bundled = await bundleOwnedAssetsInMarkdown(
        markdown,
        userId,
        usedAssetNames
      );
      markdown = bundled.markdown;
      for (const asset of bundled.assets) {
        entries.push({ path: asset.zipPath, data: asset.data });
      }
    }

    entries.push({ path, data: encoder.encode(markdown) });
  }

  const blob = new Blob([buildZip(entries) as BlobPart], {
    type: "application/zip",
  });
  return { blob, fileCount: entries.length };
}

/** Download the whole workspace as blogide-export-YYYY-MM-DD.zip. */
export async function downloadWorkspaceZip(): Promise<number> {
  const { blob, fileCount } = await exportWorkspaceZip();
  const stamp = new Date().toISOString().slice(0, 10);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `blogide-export-${stamp}.zip`;
  anchor.click();
  URL.revokeObjectURL(url);
  return fileCount;
}
