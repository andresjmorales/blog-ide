import { fileNameToTitle } from "@/lib/markdown/titleFrontmatter";
import { folderPathLabel } from "@/lib/workspace/tree";
import type { WorkspaceNode } from "@/lib/workspace/types";

export function workspaceItemLabel(
  node: WorkspaceNode,
  titles?: Map<string, string>
): string {
  if (node.kind === "folder") {
    const name = node.name.replace(/\/$/, "").trim() || "folder";
    return `${name}/`;
  }
  const title = titles?.get(node.id)?.trim();
  if (title) return title;
  return fileNameToTitle(node.name) || node.name;
}

export function workspaceMoveToastMessage(input: {
  node: WorkspaceNode;
  parentId: string | null;
  trashId: string | undefined;
  wasInTrash: boolean;
  nodes: WorkspaceNode[];
  titles?: Map<string, string>;
}): string {
  const name = workspaceItemLabel(input.node, input.titles);
  if (input.trashId && input.parentId === input.trashId) {
    return `Moved “${name}” to Trash.`;
  }
  if (input.wasInTrash) {
    if (input.parentId == null) return `Restored “${name}”.`;
    return `Restored “${name}” to ${folderPathLabel(input.parentId, input.nodes)}.`;
  }
  return `Moved “${name}” to ${folderPathLabel(input.parentId, input.nodes)}.`;
}

export function workspaceDeleteToastMessage(
  node: WorkspaceNode,
  titles?: Map<string, string>
): string {
  return `Deleted “${workspaceItemLabel(node, titles)}” permanently.`;
}
