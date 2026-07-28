import { getLocalDoc } from "@/lib/db/indexed";
import { splitFrontmatter } from "@/lib/markdown/frontmatter";
import { parseTitle } from "@/lib/markdown/titleFrontmatter";
import { listAllDocumentBodies } from "@/lib/workspace/api";
import {
  getInboxNode,
  getTrashNode,
  isInTrash,
} from "@/lib/workspace/tree";
import type { WorkspaceNode } from "@/lib/workspace/types";

/** Extract frontmatter title from a markdown document, if present. */
export function titleFromMarkdown(markdown: string): string | null {
  const { frontmatter } = splitFrontmatter(markdown);
  return parseTitle(frontmatter);
}

/**
 * Essay documents whose explorer label can show a frontmatter title.
 * Skips Trash and Notes (inbox) channel docs.
 */
export function titleCandidateNodes(nodes: WorkspaceNode[]): WorkspaceNode[] {
  const inboxId = getInboxNode(nodes)?.id ?? null;
  const trashId = getTrashNode(nodes)?.id ?? null;
  return nodes.filter((n) => {
    if (n.kind !== "document") return false;
    if (inboxId && n.parent_id === inboxId) return false;
    if (isInTrash(n.id, nodes, trashId)) return false;
    return true;
  });
}

function applyTitle(
  titles: Map<string, string>,
  nodeId: string,
  markdown: string | null | undefined
): void {
  if (markdown == null) return;
  const title = titleFromMarkdown(markdown);
  if (title) titles.set(nodeId, title);
}

/**
 * Load frontmatter titles for essay documents.
 *
 * Matches `openDocument` freshness rules so the Files tab does not paint
 * stale IndexedDB titles over a tree that already came from Supabase:
 * - dirty local drafts win (unsynced edits / offline)
 * - otherwise prefer the remote body
 * - fall back to a clean local copy only when remote is unavailable
 */
export async function loadDocumentTitles(
  nodes: WorkspaceNode[]
): Promise<Map<string, string>> {
  const candidates = titleCandidateNodes(nodes);
  const titles = new Map<string, string>();
  if (candidates.length === 0) return titles;

  const dirtyLocal = new Map<string, string>();
  const cleanLocal = new Map<string, string>();
  const needRemote: string[] = [];

  await Promise.all(
    candidates.map(async (node) => {
      try {
        const local = await getLocalDoc(node.id);
        if (local?.markdown != null && local.dirty) {
          dirtyLocal.set(node.id, local.markdown);
          return;
        }
        if (local?.markdown != null) {
          cleanLocal.set(node.id, local.markdown);
        }
        needRemote.push(node.id);
      } catch {
        needRemote.push(node.id);
      }
    })
  );

  for (const [id, markdown] of dirtyLocal) {
    applyTitle(titles, id, markdown);
  }

  if (needRemote.length > 0) {
    let remoteBodies: Map<string, string> | null = null;
    try {
      remoteBodies = await listAllDocumentBodies();
    } catch {
      remoteBodies = null;
    }
    for (const id of needRemote) {
      const remote = remoteBodies?.get(id);
      if (remote != null) {
        applyTitle(titles, id, remote);
        continue;
      }
      applyTitle(titles, id, cleanLocal.get(id));
    }
  }

  return titles;
}

/** Merge one document's title into an existing map (e.g. after save). */
export function setTitleFromMarkdown(
  titles: Map<string, string>,
  nodeId: string,
  markdown: string
): Map<string, string> {
  const next = new Map(titles);
  const title = titleFromMarkdown(markdown);
  if (title) next.set(nodeId, title);
  else next.delete(nodeId);
  return next;
}
