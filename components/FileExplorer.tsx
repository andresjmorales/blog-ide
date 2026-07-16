"use client";

import { useMemo, useState, type MouseEvent } from "react";
import {
  ExplorerContextMenu,
  type ContextMenuItem,
} from "@/components/ExplorerContextMenu";
import {
  eligibleMoveFolders,
  folderPathLabel,
  getTrashNode,
  isInTrash,
  isScratchpad,
} from "@/lib/workspace/tree";
import type { WorkspaceNode } from "@/lib/workspace/types";

type Props = {
  nodes: WorkspaceNode[];
  activeNodeId: string | null;
  onOpen: (nodeId: string) => void;
  onNewDocument: (parentId: string | null) => void;
  onNewFolder: (parentId: string | null) => void;
  onMoveToTrash: (nodeId: string) => void;
  onRestore: (nodeId: string, parentId: string | null) => void;
  onMoveTo: (nodeId: string, parentId: string | null) => void;
  onDeleteForever: (nodeId: string) => void;
  loading?: boolean;
  error?: string | null;
};

type MenuState = {
  x: number;
  y: number;
  node: WorkspaceNode;
};

function childrenOf(
  nodes: WorkspaceNode[],
  parentId: string | null
): WorkspaceNode[] {
  return nodes
    .filter((node) => node.parent_id === parentId)
    .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));
}

export function FileExplorer({
  nodes,
  activeNodeId,
  onOpen,
  onNewDocument,
  onNewFolder,
  onMoveToTrash,
  onRestore,
  onMoveTo,
  onDeleteForever,
  loading,
  error,
}: Props) {
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [trashOpen, setTrashOpen] = useState(true);

  const trash = getTrashNode(nodes);
  const trashId = trash?.id ?? null;

  const mainRoots = useMemo(
    () =>
      childrenOf(nodes, null).filter(
        (n) => n.system_key !== "trash" && !isInTrash(n.id, nodes, trashId)
      ),
    [nodes, trashId]
  );

  const trashChildren = useMemo(
    () => (trashId ? childrenOf(nodes, trashId) : []),
    [nodes, trashId]
  );

  function openMenu(e: MouseEvent, node: WorkspaceNode) {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ x: e.clientX, y: e.clientY, node });
  }

  function buildMenuItems(node: WorkspaceNode): ContextMenuItem[] {
    const inTrash = isInTrash(node.id, nodes, trashId);
    const isTrashFolder = node.system_key === "trash";
    const scratch = isScratchpad(node);
    const items: ContextMenuItem[] = [];

    if (isTrashFolder) {
      return [
        {
          kind: "action",
          id: "trash-info",
          label: "System Trash",
          disabled: true,
          onSelect: () => {},
        },
      ];
    }

    if (node.kind === "folder" && !inTrash) {
      items.push(
        {
          kind: "action",
          id: "new-doc",
          label: "New document",
          onSelect: () => onNewDocument(node.id),
        },
        {
          kind: "action",
          id: "new-folder",
          label: "New folder",
          onSelect: () => onNewFolder(node.id),
        },
        { kind: "separator", id: "sep-new" }
      );
    }

    if (inTrash) {
      const restoreFolders = eligibleMoveFolders(nodes, node.id, {
        includeTrash: false,
      });
      items.push({
        kind: "submenu",
        id: "restore",
        label: "Restore to…",
        items: [
          {
            id: "restore-root",
            label: "Workspace root",
            onSelect: () => onRestore(node.id, null),
          },
          ...restoreFolders.map((folder) => ({
            id: `restore-${folder.id}`,
            label: folderPathLabel(folder.id, nodes),
            onSelect: () => onRestore(node.id, folder.id),
          })),
        ],
      });
    } else {
      const moveFolders = eligibleMoveFolders(nodes, node.id, {
        includeTrash: false,
      }).filter((folder) => folder.id !== node.parent_id);

      items.push({
        kind: "submenu",
        id: "move",
        label: "Move to…",
        items: [
          ...(node.parent_id != null
            ? [
                {
                  id: "move-root",
                  label: "Workspace root",
                  onSelect: () => onMoveTo(node.id, null),
                },
              ]
            : []),
          ...moveFolders.map((folder) => ({
            id: `move-${folder.id}`,
            label: folderPathLabel(folder.id, nodes),
            onSelect: () => onMoveTo(node.id, folder.id),
          })),
        ],
      });

      items.push({
        kind: "action",
        id: "trash",
        label: "Move to Trash",
        disabled: scratch || !trashId,
        onSelect: () => onMoveToTrash(node.id),
      });
    }

    items.push({ kind: "separator", id: "sep-del" });
    items.push({
      kind: "action",
      id: "delete",
      label: "Delete permanently",
      danger: true,
      disabled: scratch,
      onSelect: () => onDeleteForever(node.id),
    });

    return items;
  }

  return (
    <div className="p-3">
      <div className="mb-3 flex flex-col gap-2">
        <p className="text-xs font-mono uppercase tracking-wider text-muted">
          Files
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            title="New document"
            className="flex-1 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-foreground hover:border-accent hover:text-accent"
            onClick={() => onNewDocument(null)}
          >
            + Document
          </button>
          <button
            type="button"
            title="New folder"
            className="flex-1 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-foreground hover:border-accent hover:text-accent"
            onClick={() => onNewFolder(null)}
          >
            + Folder
          </button>
        </div>
      </div>

      {loading && (
        <p className="text-xs text-muted">Loading workspace…</p>
      )}
      {error && (
        <p className="mb-2 text-xs text-red-600 dark:text-red-400">{error}</p>
      )}

      <ul className="space-y-0.5 text-sm">
        {mainRoots.map((node) => (
          <TreeNode
            key={node.id}
            node={node}
            nodes={nodes}
            depth={0}
            activeNodeId={activeNodeId}
            trashId={trashId}
            onOpen={onOpen}
            onNewDocument={onNewDocument}
            onContextMenu={openMenu}
          />
        ))}
      </ul>

      {trash && (
        <div className="mt-4 border-t border-border pt-3">
          <button
            type="button"
            className="flex w-full items-center gap-1 rounded px-2 py-1.5 text-left text-xs font-mono uppercase tracking-wider text-muted hover:bg-panel hover:text-foreground"
            onClick={() => setTrashOpen((o) => !o)}
            onContextMenu={(e) => openMenu(e, trash)}
          >
            <span className="inline-block w-3">{trashOpen ? "▾" : "▸"}</span>
            Trash
            {trashChildren.length > 0 && (
              <span className="ml-auto normal-case tracking-normal">
                {trashChildren.length}
              </span>
            )}
          </button>
          {trashOpen && (
            <ul className="mt-0.5 space-y-0.5 text-sm">
              {trashChildren.length === 0 ? (
                <li className="px-2 py-1 text-xs text-muted">Empty</li>
              ) : (
                trashChildren.map((node) => (
                  <TreeNode
                    key={node.id}
                    node={node}
                    nodes={nodes}
                    depth={0}
                    activeNodeId={activeNodeId}
                    trashId={trashId}
                    onOpen={onOpen}
                    onNewDocument={onNewDocument}
                    onContextMenu={openMenu}
                  />
                ))
              )}
            </ul>
          )}
        </div>
      )}

      {menu && (
        <ExplorerContextMenu
          x={menu.x}
          y={menu.y}
          items={buildMenuItems(menu.node)}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  );
}

function TreeNode({
  node,
  nodes,
  depth,
  activeNodeId,
  trashId,
  onOpen,
  onNewDocument,
  onContextMenu,
}: {
  node: WorkspaceNode;
  nodes: WorkspaceNode[];
  depth: number;
  activeNodeId: string | null;
  trashId: string | null;
  onOpen: (nodeId: string) => void;
  onNewDocument: (parentId: string | null) => void;
  onContextMenu: (e: MouseEvent, node: WorkspaceNode) => void;
}) {
  // Trash folder is rendered separately; never nest it in the main tree.
  const visibleKids = childrenOf(nodes, node.id).filter(
    (c) => c.system_key !== "trash"
  );

  const paddingLeft = 8 + depth * 12;

  if (node.kind === "folder") {
    return (
      <li>
        <div
          className="flex items-center gap-1 rounded px-2 py-1.5 text-muted hover:bg-panel/50"
          style={{ paddingLeft }}
          onContextMenu={(e) => onContextMenu(e, node)}
        >
          <span className="min-w-0 flex-1 truncate font-medium">
            {node.name}/
          </span>
          {!isInTrash(node.id, nodes, trashId) && (
            <button
              type="button"
              title={`New document in ${node.name}`}
              className="inline-flex h-7 min-w-7 shrink-0 items-center justify-center rounded-md border border-border bg-background text-sm font-medium text-foreground hover:border-accent hover:text-accent"
              onClick={() => onNewDocument(node.id)}
            >
              +
            </button>
          )}
        </div>
        {visibleKids.length > 0 && (
          <ul>
            {visibleKids.map((child) => (
              <TreeNode
                key={child.id}
                node={child}
                nodes={nodes}
                depth={depth + 1}
                activeNodeId={activeNodeId}
                trashId={trashId}
                onOpen={onOpen}
                onNewDocument={onNewDocument}
                onContextMenu={onContextMenu}
              />
            ))}
          </ul>
        )}
      </li>
    );
  }

  if (node.kind === "link") {
    return (
      <li>
        <a
          href={node.url ?? "#"}
          target="_blank"
          rel="noreferrer"
          className="block truncate rounded px-2 py-1.5 text-muted hover:bg-panel hover:text-foreground"
          style={{ paddingLeft }}
          title={node.url ?? node.name}
          onContextMenu={(e) => onContextMenu(e, node)}
        >
          ↗ {node.name}
        </a>
      </li>
    );
  }

  const active = node.id === activeNodeId;
  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(node.id)}
        onContextMenu={(e) => onContextMenu(e, node)}
        className={`flex w-full items-center truncate rounded px-2 py-1.5 text-left ${
          active
            ? "bg-panel font-medium text-foreground"
            : "text-muted hover:bg-panel/70 hover:text-foreground"
        }`}
        style={{ paddingLeft }}
      >
        <span className="truncate">{node.name}</span>
        {node.pinned && (
          <span className="ml-2 shrink-0 text-[10px] font-mono uppercase text-muted">
            pinned
          </span>
        )}
      </button>
    </li>
  );
}
