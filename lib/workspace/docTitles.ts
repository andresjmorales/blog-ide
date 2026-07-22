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

/**
 * Load frontmatter titles for essay documents. Prefers IndexedDB drafts,
 * then a single remote bodies fetch for anything missing. Non-blocking
 * callers should fire-and-forget.
 */
export async function loadDocumentTitles(
  nodes: WorkspaceNode[]
): Promise<Map<string, string>> {
  const candidates = titleCandidateNodes(nodes);
  const titles = new Map<string, string>();
  if (candidates.length === 0) return titles;

  let remoteBodies: Map<string, string> | null = null;
  const needRemote: string[] = [];

  await Promise.all(
    candidates.map(async (node) => {
      try {
        const local = await getLocalDoc(node.id);
        if (local?.markdown != null) {
          const title = titleFromMarkdown(local.markdown);
          if (title) titles.set(node.id, title);
          return;
        }
        needRemote.push(node.id);
      } catch {
        needRemote.push(node.id);
      }
    })
  );

  if (needRemote.length > 0) {
    try {
      remoteBodies = await listAllDocumentBodies();
    } catch {
      remoteBodies = null;
    }
    if (remoteBodies) {
      for (const id of needRemote) {
        const md = remoteBodies.get(id);
        if (!md) continue;
        const title = titleFromMarkdown(md);
        if (title) titles.set(id, title);
      }
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
