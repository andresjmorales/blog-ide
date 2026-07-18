"use client";

import { useMemo, useState, type MouseEvent } from "react";
import {
  ExplorerContextMenu,
  type ContextMenuItem,
} from "@/components/ExplorerContextMenu";
import {
  eligibleMoveFolders,
  folderPathLabel,
  getInboxNode,
  getTrashNode,
  isInTrash,
  isScratchpad,
  isSystemFolder,
} from "@/lib/workspace/tree";
import type { WorkspaceNode } from "@/lib/workspace/types";

type Props = {
  nodes: WorkspaceNode[];
  activeNodeId: string | null;
  onOpen: (nodeId: string) => void;
  onNewDocument: (parentId: string | null) => void;
  /** Create an Inbox channel document (different prompt than New essay). */
  onNewChannel: (inboxId: string) => void;
  onPopOutDocument: (nodeId: string) => void;
  onNewFolder: (parentId: string | null) => void;
  onMoveToTrash: (nodeId: string) => void;
  onRestore: (nodeId: string, parentId: string | null) => void;
  onMoveTo: (nodeId: string, parentId: string | null) => void;
  onRename: (nodeId: string) => void;
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

/** Display label — hide the .md extension; storage still uses it. */
function displayName(node: WorkspaceNode): string {
  if (node.kind === "document") {
    return node.name.replace(/\.md$/i, "");
  }
  return node.name;
}

export function FileExplorer({
  nodes,
  activeNodeId,
  onOpen,
  onNewDocument,
  onNewChannel,
  onPopOutDocument,
  onNewFolder,
  onMoveToTrash,
  onRestore,
  onMoveTo,
  onRename,
  onDeleteForever,
  loading,
  error,
}: Props) {
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [trashOpen, setTrashOpen] = useState(true);
  const [inboxOpen, setInboxOpen] = useState(true);

  const trash = getTrashNode(nodes);
  const trashId = trash?.id ?? null;
  const inbox = getInboxNode(nodes);
  const inboxId = inbox?.id ?? null;

  const mainRoots = useMemo(
    () =>
      childrenOf(nodes, null).filter(
        (n) =>
          n.system_key !== "trash" &&
          n.system_key !== "inbox" &&
          !isInTrash(n.id, nodes, trashId)
      ),
    [nodes, trashId]
  );

  const inboxChildren = useMemo(
    () => (inboxId ? childrenOf(nodes, inboxId) : []),
    [nodes, inboxId]
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
    const systemFolder = isSystemFolder(node);
    const scratch = isScratchpad(node);
    const items: ContextMenuItem[] = [];

    if (systemFolder) {
      if (node.system_key === "inbox") {
        return [
          {
            kind: "action",
            id: "inbox-new-channel",
            label: "New channel",
            onSelect: () => onNewChannel(node.id),
          },
          {
            kind: "action",
            id: "inbox-info",
            label: "System Inbox",
            disabled: true,
            onSelect: () => {},
          },
        ];
      }
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

    if (node.kind === "document" && !inTrash) {
      items.push({
        kind: "action",
        id: "pop-out",
        label: "Pop out",
        onSelect: () => onPopOutDocument(node.id),
      });
    }

    if (!scratch) {
      items.push({
        kind: "action",
        id: "rename",
        label: "Rename",
        disabled: inTrash,
        onSelect: () => onRename(node.id),
      });
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
      <div className="mb-3">
        <div className="explorer-toolbar">
          <button
            type="button"
            title="New document"
            aria-label="New document"
            className="explorer-toolbar-btn"
            onClick={() => onNewDocument(null)}
          >
            <DocPlusIcon />
          </button>
          <button
            type="button"
            title="New folder"
            aria-label="New folder"
            className="explorer-toolbar-btn"
            onClick={() => onNewFolder(null)}
          >
            <FolderPlusIcon />
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
            onNewFolder={onNewFolder}
            onContextMenu={openMenu}
          />
        ))}
      </ul>

      {inbox && (
        <div className="mt-4 border-t border-border pt-3">
          <button
            type="button"
            className="flex w-full items-center gap-1 rounded px-2 py-1.5 text-left text-xs font-mono uppercase tracking-wider text-muted hover:bg-panel hover:text-foreground"
            onClick={() => setInboxOpen((o) => !o)}
            onContextMenu={(e) => openMenu(e, inbox)}
          >
            <span className="inline-block w-3">{inboxOpen ? "▾" : "▸"}</span>
            Inbox
            {inboxChildren.length > 0 && (
              <span className="ml-auto normal-case tracking-normal">
                {inboxChildren.length}
              </span>
            )}
          </button>
          {inboxOpen && (
            <ul className="mt-0.5 space-y-0.5 text-sm">
              {inboxChildren.length === 0 ? (
                <li className="px-2 py-1 text-xs text-muted">No channels</li>
              ) : (
                inboxChildren.map((node) => (
                  <TreeNode
                    key={node.id}
                    node={node}
                    nodes={nodes}
                    depth={0}
                    activeNodeId={activeNodeId}
                    trashId={trashId}
                    onOpen={onOpen}
                    onNewDocument={onNewDocument}
                    onNewFolder={onNewFolder}
                    onContextMenu={openMenu}
                  />
                ))
              )}
            </ul>
          )}
        </div>
      )}

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
                    onNewFolder={onNewFolder}
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

function DocPlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M4 1.5h5.5L13 5v9.5H4V1.5z"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <path d="M9.5 1.5V5H13" stroke="currentColor" strokeWidth="1.2" />
      <path
        d="M8 8v4M6 10h4"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function FolderPlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M1.5 4.5h4l1.5 1.5H14.5v7.5H1.5V4.5z"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <path
        d="M8 8v4M6 10h4"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
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
  onNewFolder,
  onContextMenu,
}: {
  node: WorkspaceNode;
  nodes: WorkspaceNode[];
  depth: number;
  activeNodeId: string | null;
  trashId: string | null;
  onOpen: (nodeId: string) => void;
  onNewDocument: (parentId: string | null) => void;
  onNewFolder: (parentId: string | null) => void;
  onContextMenu: (e: MouseEvent, node: WorkspaceNode) => void;
}) {
  // System folders are rendered separately; never nest them in the main tree.
  const visibleKids = childrenOf(nodes, node.id).filter(
    (c) => c.system_key !== "trash" && c.system_key !== "inbox"
  );

  const paddingLeft = 8 + depth * 12;

  if (node.kind === "folder") {
    return (
      <li>
        <div
          className="explorer-folder-row group flex items-center gap-0.5 rounded px-2 py-1 text-muted hover:bg-panel/50"
          style={{ paddingLeft }}
          onContextMenu={(e) => onContextMenu(e, node)}
        >
          <span className="min-w-0 flex-1 truncate text-sm font-medium">
            {displayName(node)}/
          </span>
          {!isInTrash(node.id, nodes, trashId) && (
            <span className="explorer-folder-actions inline-flex shrink-0 gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
              <button
                type="button"
                title={`New document in ${node.name}`}
                aria-label={`New document in ${node.name}`}
                className="explorer-icon-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  onNewDocument(node.id);
                }}
              >
                <DocPlusIcon />
              </button>
              <button
                type="button"
                title={`New folder in ${node.name}`}
                aria-label={`New folder in ${node.name}`}
                className="explorer-icon-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  onNewFolder(node.id);
                }}
              >
                <FolderPlusIcon />
              </button>
            </span>
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
                onNewFolder={onNewFolder}
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
          ↗ {displayName(node)}
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
        <span className="truncate">{displayName(node)}</span>
        {node.pinned && (
          <span className="ml-2 shrink-0 text-[10px] font-mono uppercase text-muted">
            pinned
          </span>
        )}
      </button>
    </li>
  );
}
