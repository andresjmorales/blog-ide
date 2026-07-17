"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  loadLocalPrefs,
  mergePrefs,
  savePrefs,
  type EditorPrefs,
} from "@/lib/settings";
import { DocumentWorkspace } from "@/components/DocumentWorkspace";
import { SettingsPanel } from "@/components/SettingsPanel";
import { HelpPanel } from "@/components/HelpPanel";
import { UserMenu } from "@/components/UserMenu";
import { AiSidebar } from "@/components/AiSidebar";
import { EditorPrefsProvider } from "@/components/EditorPrefsContext";
import { DocumentSessionProvider } from "@/components/DocumentSessionContext";
import { DeletedFootnotesPanel } from "@/components/DeletedFootnotesPanel";
import { FileExplorer } from "@/components/FileExplorer";
import { AppDialogProvider, useAppDialog } from "@/components/AppDialog";
import type { DeletedFootnote } from "@/lib/markdown/deletedFootnotes";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { deleteLocalDoc } from "@/lib/db/indexed";
import {
  fileNameToTitle,
  titleToFileName,
} from "@/lib/markdown/titleFrontmatter";
import {
  createWorkspaceNode,
  deleteWorkspaceNode,
  ensureDefaultWorkspace,
  listWorkspaceNodes,
  moveWorkspaceNode,
  renameWorkspaceNode,
} from "@/lib/workspace/api";
import {
  documentIdsInSubtree,
  getTrashNode,
  isScratchpad,
} from "@/lib/workspace/tree";
import type { WorkspaceNode } from "@/lib/workspace/types";
import {
  formatSyncLabel,
  getSyncStatus,
  subscribeSyncStatus,
  type SyncStatus,
} from "@/lib/sync/engine";

const MIN_PANEL = 180;
const MAX_PANEL = 480;

const noopSubscribe = () => () => {};

/** False during SSR and the hydration render, true afterwards. */
function useHydrated() {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false
  );
}

function useSyncStatusLabel() {
  const [status, setStatus] = useState<SyncStatus>(getSyncStatus);
  useEffect(() => subscribeSyncStatus(setStatus), []);
  return { status, label: formatSyncLabel(status) };
}

export function AppShell({
  userEmail,
  displayName,
}: {
  userEmail: string;
  displayName?: string;
}) {
  return (
    <AppDialogProvider>
      <AppShellContent userEmail={userEmail} displayName={displayName} />
    </AppDialogProvider>
  );
}

function AppShellContent({
  userEmail,
  displayName,
}: {
  userEmail: string;
  displayName?: string;
}) {
  const router = useRouter();
  const previewMode = !isSupabaseConfigured() || userEmail === "not signed in";
  const [storedPrefs, setPrefs] = useState(() =>
    mergePrefs(typeof window === "undefined" ? {} : loadLocalPrefs())
  );
  const hydrated = useHydrated();
  const prefs = hydrated ? storedPrefs : mergePrefs({});
  const dragging = useRef<"left" | "right" | null>(null);
  const prefsRef = useRef(storedPrefs);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [aiDocumentMarkdown, setAiDocumentMarkdown] = useState<string | null>(
    null
  );
  const applyMarkdownRef = useRef<(markdown: string) => void>(() => {});
  const [deletedFootnotes, setDeletedFootnotes] = useState<DeletedFootnote[]>(
    []
  );
  const restoreRef = useRef<(id: string) => void>(() => {});
  const dismissRef = useRef<(id: string) => void>(() => {});

  const [nodes, setNodes] = useState<WorkspaceNode[]>([]);
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
  const [treeLoading, setTreeLoading] = useState(false);
  const [treeError, setTreeError] = useState<string | null>(null);
  const { status: syncStatus, label: syncLabel } = useSyncStatusLabel();
  const dialog = useAppDialog();
  const resolvedName =
    displayName?.trim() ||
    (previewMode ? "Preview" : userEmail.split("@")[0] || "Account");
  const activeNode = nodes.find((n) => n.id === activeNodeId) ?? null;

  useEffect(() => {
    prefsRef.current = storedPrefs;
  }, [storedPrefs]);

  const update = useCallback((patch: Partial<EditorPrefs>, persist = true) => {
    setPrefs((p) => {
      const next = { ...p, ...patch };
      if (persist) savePrefs(next);
      return next;
    });
  }, []);

  const registerDeletedActions = useCallback(
    (actions: {
      restore: (id: string) => void;
      dismiss: (id: string) => void;
    }) => {
      restoreRef.current = actions.restore;
      dismissRef.current = actions.dismiss;
    },
    []
  );

  const sessionValue = useMemo(
    () => ({
      deletedFootnotes,
      restoreDeletedFootnote: (id: string) => restoreRef.current(id),
      dismissDeletedFootnote: (id: string) => dismissRef.current(id),
    }),
    [deletedFootnotes]
  );

  const refreshTree = useCallback(async () => {
    if (previewMode) return;
    try {
      const list = await listWorkspaceNodes();
      setNodes(list);
      setTreeError(null);
    } catch (error) {
      setTreeError(
        error instanceof Error ? error.message : "Could not load files."
      );
    }
  }, [previewMode]);

  useEffect(() => {
    if (previewMode) return;

    let cancelled = false;
    async function boot() {
      setTreeLoading(true);
      try {
        const ids = await ensureDefaultWorkspace();
        const list = await listWorkspaceNodes();
        if (cancelled) return;
        setNodes(list);
        setActiveNodeId((current) => current ?? ids.scratchpadId);
        setTreeError(null);
      } catch (error) {
        if (cancelled) return;
        setTreeError(
          error instanceof Error
            ? error.message
            : "Could not bootstrap workspace. Did you run supabase/schema.sql?"
        );
      } finally {
        if (!cancelled) setTreeLoading(false);
      }
    }

    void boot();
    return () => {
      cancelled = true;
    };
  }, [previewMode]);

  useEffect(() => {
    function onMove(e: PointerEvent) {
      if (!dragging.current) return;
      if (dragging.current === "left") {
        const w = Math.min(MAX_PANEL, Math.max(MIN_PANEL, e.clientX));
        setPrefs((p) => ({ ...p, leftWidth: w }));
      } else {
        const w = Math.min(
          MAX_PANEL,
          Math.max(MIN_PANEL, window.innerWidth - e.clientX)
        );
        setPrefs((p) => ({ ...p, rightWidth: w }));
      }
    }
    function onUp() {
      if (dragging.current) {
        dragging.current = null;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        savePrefs(prefsRef.current);
      }
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, []);

  function startDrag(side: "left" | "right") {
    dragging.current = side;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  async function handleNewDocument(parentId: string | null) {
    if (previewMode) return;
    const name = await dialog.prompt({
      title: "New essay",
      message: "Title for the essay (also used as the file name).",
      defaultValue: "Untitled",
      confirmLabel: "Create",
    });
    if (!name?.trim()) return;
    const title = name.trim().replace(/\.md$/i, "");
    const fileName = titleToFileName(title);
    try {
      const id = await createWorkspaceNode({
        kind: "document",
        name: fileName,
        parentId,
        // Title lives in frontmatter + the Title field — not as Heading 1.
        markdown: `---\ntitle: ${title}\nstatus: draft\n---\n\n`,
      });
      await refreshTree();
      setActiveNodeId(id);
    } catch (error) {
      setTreeError(
        error instanceof Error ? error.message : "Could not create document."
      );
    }
  }

  async function handleNewFolder(parentId: string | null) {
    if (previewMode) return;
    const name = await dialog.prompt({
      title: "New folder",
      message: "Folder name in the workspace tree.",
      defaultValue: "notes",
      confirmLabel: "Create",
    });
    if (!name) return;
    try {
      await createWorkspaceNode({
        kind: "folder",
        name,
        parentId,
      });
      await refreshTree();
    } catch (error) {
      setTreeError(
        error instanceof Error ? error.message : "Could not create folder."
      );
    }
  }

  async function handleMoveTo(nodeId: string, parentId: string | null) {
    if (previewMode) return;
    try {
      await moveWorkspaceNode(nodeId, parentId);
      await refreshTree();
    } catch (error) {
      setTreeError(
        error instanceof Error ? error.message : "Could not move item."
      );
    }
  }

  async function handleMoveToTrash(nodeId: string) {
    if (previewMode) return;
    const node = nodes.find((n) => n.id === nodeId);
    if (!node || isScratchpad(node) || node.system_key === "trash") return;
    const trash = getTrashNode(nodes);
    if (!trash) {
      setTreeError("Trash folder is missing. Re-run supabase/schema.sql.");
      return;
    }
    await handleMoveTo(nodeId, trash.id);
  }

  async function handleRestore(nodeId: string, parentId: string | null) {
    await handleMoveTo(nodeId, parentId);
  }

  async function handleRename(nodeId: string) {
    if (previewMode) return;
    const node = nodes.find((n) => n.id === nodeId);
    if (!node || node.system_key === "trash" || isScratchpad(node)) return;

    const currentTitle =
      node.kind === "document"
        ? fileNameToTitle(node.name)
        : node.name.replace(/\/$/, "");
    const next = await dialog.prompt({
      title: "Rename",
      message:
        node.kind === "document"
          ? "New title (also updates the file name)."
          : "New folder name.",
      defaultValue: currentTitle,
      confirmLabel: "Rename",
    });
    if (!next?.trim()) return;

    const newName =
      node.kind === "document" ? titleToFileName(next) : next.trim();
    try {
      await renameWorkspaceNode(nodeId, newName);
      await refreshTree();
    } catch (error) {
      setTreeError(
        error instanceof Error ? error.message : "Could not rename."
      );
    }
  }

  async function handleRenameDocument(nodeId: string, fileName: string) {
    if (previewMode) return;
    const node = nodes.find((n) => n.id === nodeId);
    if (!node || isScratchpad(node) || node.name === fileName) return;
    await renameWorkspaceNode(nodeId, fileName);
    await refreshTree();
  }

  async function handleDeleteForever(nodeId: string) {
    if (previewMode) return;
    const node = nodes.find((n) => n.id === nodeId);
    if (!node || isScratchpad(node) || node.system_key === "trash") return;

    const label =
      node.kind === "folder" ? `${node.name}/ and its contents` : node.name;
    const ok = await dialog.confirm({
      title: "Delete permanently?",
      message: `“${label}” will be removed forever. This cannot be undone.`,
      confirmLabel: "Delete forever",
      danger: true,
    });
    if (!ok) return;

    const docIds = documentIdsInSubtree(nodeId, nodes);
    try {
      await deleteWorkspaceNode(nodeId);
      await Promise.all(docIds.map((id) => deleteLocalDoc(id)));
      if (activeNodeId && docIds.includes(activeNodeId)) {
        setActiveNodeId(null);
      } else if (activeNodeId === nodeId) {
        setActiveNodeId(null);
      }
      await refreshTree();
    } catch (error) {
      setTreeError(
        error instanceof Error ? error.message : "Could not delete item."
      );
    }
  }

  return (
    <EditorPrefsProvider prefs={prefs} updatePrefs={update}>
      <DocumentSessionProvider value={sessionValue}>
        <div className="flex flex-col h-dvh">
          <header className="flex items-center justify-between border-b border-border px-3 h-11 shrink-0">
            <div className="flex items-center gap-2">
              <button
                onClick={() => update({ leftOpen: !prefs.leftOpen })}
                title="Toggle file tree"
                className="rounded p-1.5 text-muted hover:bg-panel hover:text-foreground"
              >
                <PanelIcon side="left" />
              </button>
              <span className="text-sm font-semibold tracking-tight">
                BlogIDE
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted">
              <span
                className={`hidden sm:inline ${
                  syncStatus.error ? "text-red-600 dark:text-red-400" : ""
                }`}
                title={syncStatus.error ?? syncStatus.message ?? undefined}
              >
                {previewMode ? "Preview mode · not synced" : syncLabel}
              </span>
              <UserMenu
                displayName={resolvedName}
                email={previewMode ? "" : userEmail}
                previewMode={previewMode}
                onAccountSettings={() => setSettingsOpen(true)}
                onHelp={() => setHelpOpen(true)}
                onSignOut={() => void signOut()}
              />
              <button
                onClick={() => update({ rightOpen: !prefs.rightOpen })}
                title="Toggle right panel"
                className="rounded p-1.5 text-muted hover:bg-panel hover:text-foreground"
              >
                <PanelIcon side="right" />
              </button>
            </div>
          </header>

          {syncStatus.message && (
            <div
              role="status"
              className="flex flex-wrap items-center gap-3 border-b border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm"
            >
              <span>{syncStatus.message}</span>
              {syncStatus.conflictCopyId && (
                <button
                  type="button"
                  className="rounded border border-border px-2 py-0.5 text-xs hover:bg-panel"
                  onClick={() => setActiveNodeId(syncStatus.conflictCopyId)}
                >
                  Open conflict copy
                </button>
              )}
            </div>
          )}

          <div className="flex flex-1 min-h-0">
            {prefs.leftOpen && (
              <>
                <aside
                  style={{ width: prefs.leftWidth }}
                  className="shrink-0 border-r border-border bg-panel/60 overflow-y-auto hidden md:block"
                >
                  {previewMode ? (
                    <div className="p-3">
                      <p className="text-xs font-mono uppercase tracking-wider text-muted mb-3">
                        Files
                      </p>
                      <ul className="space-y-0.5 text-sm">
                        <li className="rounded px-2 py-1.5 bg-panel font-medium">
                          scratchpad.md
                          <span className="ml-2 text-[10px] font-mono uppercase text-muted">
                            preview
                          </span>
                        </li>
                      </ul>
                      <p className="mt-6 text-xs text-muted leading-relaxed">
                        Connect Supabase and sign in to persist your workspace
                        tree.
                      </p>
                    </div>
                  ) : (
                    <>
                      <FileExplorer
                        nodes={nodes}
                        activeNodeId={activeNodeId}
                        onOpen={setActiveNodeId}
                        onNewDocument={handleNewDocument}
                        onNewFolder={handleNewFolder}
                        onMoveToTrash={handleMoveToTrash}
                        onRestore={handleRestore}
                        onMoveTo={handleMoveTo}
                        onRename={handleRename}
                        onDeleteForever={handleDeleteForever}
                        loading={treeLoading}
                        error={treeError}
                      />
                      <div className="px-3 pb-3">
                        <DeletedFootnotesPanel />
                      </div>
                    </>
                  )}
                </aside>
                <div
                  onPointerDown={() => startDrag("left")}
                  className="w-1 cursor-col-resize hover:bg-accent/40 shrink-0 hidden md:block"
                />
              </>
            )}

            <main className="flex-1 min-w-0 min-h-0">
              <DocumentWorkspace
                nodeId={previewMode ? null : activeNodeId}
                documentName={activeNode?.name ?? null}
                canRenameDocument={
                  !activeNode || !isScratchpad(activeNode)
                }
                previewMode={previewMode}
                onDeletedFootnotesChange={setDeletedFootnotes}
                registerDeletedActions={registerDeletedActions}
                onRequestTreeRefresh={refreshTree}
                onRenameDocument={handleRenameDocument}
                onMarkdownForAi={setAiDocumentMarkdown}
                registerApplyMarkdown={(apply) => {
                  applyMarkdownRef.current = apply;
                }}
              />
            </main>

            {prefs.rightOpen && (
              <>
                <div
                  onPointerDown={() => startDrag("right")}
                  className="w-1 cursor-col-resize hover:bg-accent/40 shrink-0 hidden md:block"
                />
                <aside
                  style={{ width: prefs.rightWidth }}
                  className="shrink-0 border-l border-border bg-panel/60 flex-col hidden md:flex"
                >
                  <div className="flex border-b border-border text-sm">
                    {(["ai", "preview"] as const).map((tab) => (
                      <button
                        key={tab}
                        onClick={() => update({ rightTab: tab })}
                        className={`flex-1 px-3 py-2 capitalize ${
                          prefs.rightTab === tab
                            ? "border-b-2 border-accent font-medium"
                            : "text-muted hover:text-foreground"
                        }`}
                      >
                        {tab === "ai" ? "AI assistant" : "Preview"}
                      </button>
                    ))}
                  </div>
                  <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                    {prefs.rightTab === "ai" ? (
                      <AiSidebar
                        documentMarkdown={aiDocumentMarkdown}
                        onApplyMarkdown={(markdown) =>
                          applyMarkdownRef.current(markdown)
                        }
                        onOpenSettings={() => setSettingsOpen(true)}
                      />
                    ) : (
                      <div className="overflow-y-auto p-4 text-sm text-muted leading-relaxed">
                        <p>
                          The publication-style preview arrives in milestone 5 —
                          rendered through the same remark/rehype pipeline used
                          for export.
                        </p>
                      </div>
                    )}
                  </div>
                </aside>
              </>
            )}
          </div>

          <SettingsPanel
            open={settingsOpen}
            onClose={() => setSettingsOpen(false)}
          />
          <HelpPanel open={helpOpen} onClose={() => setHelpOpen(false)} />
        </div>
      </DocumentSessionProvider>
    </EditorPrefsProvider>
  );
}

function PanelIcon({ side }: { side: "left" | "right" }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect
        x="1.5"
        y="2.5"
        width="13"
        height="11"
        rx="1.5"
        stroke="currentColor"
      />
      <line
        x1={side === "left" ? 5.5 : 10.5}
        y1="2.5"
        x2={side === "left" ? 5.5 : 10.5}
        y2="13.5"
        stroke="currentColor"
      />
    </svg>
  );
}

