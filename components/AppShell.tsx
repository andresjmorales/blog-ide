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
import { FileExplorer } from "@/components/FileExplorer";
import {
  AppDialogProvider,
  PROMPT_SECONDARY,
  useAppDialog,
} from "@/components/AppDialog";
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
import { pickMarkdownFile } from "@/lib/export/document";
import {
  documentIdsInSubtree,
  getTrashNode,
  isScratchpad,
  isSystemFolder,
} from "@/lib/workspace/tree";
import {
  loadActiveDocumentId,
  saveActiveDocumentId,
} from "@/lib/workspace/activeDocument";
import type { WorkspaceNode } from "@/lib/workspace/types";
import {
  formatSyncLabel,
  getSyncStatus,
  subscribeSyncStatus,
  type SyncStatus,
} from "@/lib/sync/engine";
import { openPopOut } from "@/lib/pins/popOutStore";
import { PopOutLayer } from "@/components/pins/PopOutLayer";
import { TerminalCapture } from "@/components/mobile/TerminalCapture";
import { ShellButton } from "@/components/shell/ShellButton";
import { ShellPanel } from "@/components/shell/ShellPanel";
import {
  loadMobileSurface,
  saveMobileSurface,
  subscribeMobileSurface,
  type MobileSurface,
} from "@/lib/capture/mobileSurface";
import { closeShellPin, openShellPin } from "@/lib/pins/pinStore";

const MIN_PANEL = 180;
const MAX_PANEL = 480;
const MIN_SHELL = 140;
const MAX_SHELL = 480;
const MD_BREAKPOINT = 768;

const noopSubscribe = () => () => {};

/** False during SSR and the hydration render, true afterwards. */
function useHydrated() {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false
  );
}

function subscribeMobileViewport(onStoreChange: () => void) {
  const mq = window.matchMedia(`(max-width: ${MD_BREAKPOINT - 1}px)`);
  mq.addEventListener("change", onStoreChange);
  return () => mq.removeEventListener("change", onStoreChange);
}

function getMobileViewport() {
  return window.matchMedia(`(max-width: ${MD_BREAKPOINT - 1}px)`).matches;
}

/** True when viewport is below the md breakpoint (phone / small tablet). */
function useIsMobileViewport() {
  return useSyncExternalStore(
    subscribeMobileViewport,
    getMobileViewport,
    () => false
  );
}

/** Explicit Shell vs full-app preference from localStorage (null = use default). */
function useStoredMobileSurface() {
  return useSyncExternalStore(
    subscribeMobileSurface,
    loadMobileSurface,
    () => null
  );
}

function useSyncStatusLabel() {
  const [status, setStatus] = useState<SyncStatus>(getSyncStatus);
  useEffect(() => subscribeSyncStatus(setStatus), []);
  return { status, label: formatSyncLabel(status) };
}

/**
 * Debounce conflict / sync banners so brief races (set then clear within
 * a few hundred ms) never paint a flash of amber.
 */
function useStableSyncBanner(status: SyncStatus, delayMs = 400) {
  const [confirmed, setConfirmed] = useState<{
    message: string;
    conflictCopyId: string | null;
  } | null>(null);

  useEffect(() => {
    // Always defer setState (timeout) — sync setState-in-effect trips lint.
    if (!status.message) {
      const id = window.setTimeout(() => setConfirmed(null), 0);
      return () => window.clearTimeout(id);
    }
    const id = window.setTimeout(() => {
      setConfirmed({
        message: status.message!,
        conflictCopyId: status.conflictCopyId,
      });
    }, delayMs);
    return () => window.clearTimeout(id);
  }, [status.message, status.conflictCopyId, delayMs]);

  // Hide immediately when the source message clears (don't wait on state).
  if (!status.message) return null;
  if (!confirmed || confirmed.message !== status.message) return null;
  return {
    message: status.message,
    conflictCopyId: status.conflictCopyId,
  };
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
  const isMobile = useIsMobileViewport();
  const prefs = hydrated ? storedPrefs : mergePrefs({});
  const dragging = useRef<"left" | "right" | "shell" | null>(null);
  const prefsRef = useRef(storedPrefs);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const mobileSurface = useStoredMobileSurface();
  const [shellRefreshKey, setShellRefreshKey] = useState(0);
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
  const syncBanner = useStableSyncBanner(syncStatus);
  const dialog = useAppDialog();
  const [accountName, setAccountName] = useState(displayName?.trim() ?? "");
  const resolvedName =
    accountName.trim() ||
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

  const bumpShellRefresh = useCallback(() => {
    setShellRefreshKey((k) => k + 1);
  }, []);

  const enterAppSurface = useCallback(() => {
    saveMobileSurface("app");
  }, []);

  const enterCaptureSurface = useCallback(() => {
    saveMobileSurface("capture");
    update({ leftOpen: false, rightOpen: false, shellOpen: false });
  }, [update]);

  /** Desktop: always pop-out. Phone: full-screen terminal. */
  const openShell = useCallback(() => {
    if (isMobile) {
      enterCaptureSurface();
      return;
    }
    update({ shellOpen: false });
    openShellPin();
  }, [enterCaptureSurface, isMobile, update]);

  const popShellIn = useCallback(() => {
    closeShellPin();
    update({ shellOpen: true });
  }, [update]);

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

  // Remember the open essay across refreshes (skip null so boot can restore).
  useEffect(() => {
    if (previewMode || !activeNodeId) return;
    saveActiveDocumentId(activeNodeId);
  }, [activeNodeId, previewMode]);

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
        const remembered = loadActiveDocumentId();
        const rememberedOk =
          remembered != null &&
          list.some(
            (node) => node.id === remembered && node.kind === "document"
          );
        setActiveNodeId((current) => {
          if (current) return current;
          if (rememberedOk) return remembered;
          return ids.scratchpadId;
        });
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
      } else if (dragging.current === "right") {
        const w = Math.min(
          MAX_PANEL,
          Math.max(MIN_PANEL, window.innerWidth - e.clientX)
        );
        setPrefs((p) => ({ ...p, rightWidth: w }));
      } else if (dragging.current === "shell") {
        const h = Math.min(
          MAX_SHELL,
          Math.max(MIN_SHELL, window.innerHeight - e.clientY)
        );
        setPrefs((p) => ({ ...p, shellHeight: h }));
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

  function startDrag(side: "left" | "right" | "shell") {
    dragging.current = side;
    document.body.style.cursor =
      side === "shell" ? "row-resize" : "col-resize";
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
      secondaryLabel: "Import from file (.md, .txt)",
    });
    if (name === PROMPT_SECONDARY) {
      await handleImportDocument(parentId);
      return;
    }
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

  async function handleNewChannel(inboxId: string) {
    if (previewMode) return;
    const name = await dialog.prompt({
      title: "New channel",
      message: "Name for this Inbox channel (e.g. ideas, quotes).",
      defaultValue: "channel",
      confirmLabel: "Create",
    });
    if (!name?.trim()) return;
    const title = name.trim().replace(/\.md$/i, "");
    const fileName = titleToFileName(title);
    try {
      const id = await createWorkspaceNode({
        kind: "document",
        name: fileName,
        parentId: inboxId,
        markdown: `---\ntitle: ${title}\nstatus: draft\n---\n\n`,
      });
      await refreshTree();
      setActiveNodeId(id);
    } catch (error) {
      setTreeError(
        error instanceof Error ? error.message : "Could not create channel."
      );
    }
  }

  function handlePopOutDocument(nodeId: string) {
    const node = nodes.find((n) => n.id === nodeId);
    if (!node || node.kind !== "document") return;
    openPopOut(nodeId, fileNameToTitle(node.name));
  }

  async function handleImportDocument(parentId: string | null) {
    if (previewMode) return;
    const picked = await pickMarkdownFile();
    if (!picked) return;
    const baseName = picked.name.replace(/\.(md|markdown|txt)$/i, "").trim();
    const title = baseName || "Imported";
    const fileName = titleToFileName(title);
    let markdown = picked.markdown.replace(/^\uFEFF/, "");
    if (!/^---\s*\n/.test(markdown)) {
      markdown = `---\ntitle: ${title}\nstatus: draft\n---\n\n${markdown}`;
    }
    try {
      const id = await createWorkspaceNode({
        kind: "document",
        name: fileName,
        parentId,
        markdown,
      });
      await refreshTree();
      setActiveNodeId(id);
    } catch (error) {
      setTreeError(
        error instanceof Error ? error.message : "Could not import document."
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
    if (!node || isScratchpad(node) || isSystemFolder(node)) return;
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
    if (!node || isSystemFolder(node) || isScratchpad(node)) return;

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
    if (!node || isScratchpad(node) || isSystemFolder(node)) return;

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

  const effectiveSurface: MobileSurface =
    mobileSurface ??
    (isMobile ? (prefs.mobileOpenShell ? "capture" : "app") : "app");
  const showTerminal =
    !previewMode && hydrated && effectiveSurface === "capture";

  const fileExplorer = previewMode ? (
    <div className="p-3">
      <p className="mb-3 text-xs font-mono uppercase tracking-wider text-muted">
        Files
      </p>
      <ul className="space-y-0.5 text-sm">
        <li className="rounded bg-panel px-2 py-1.5 font-medium">
          scratchpad.md
          <span className="ml-2 text-[10px] font-mono uppercase text-muted">
            preview
          </span>
        </li>
      </ul>
      <p className="mt-6 text-xs leading-relaxed text-muted">
        Connect Supabase and sign in to persist your workspace tree.
      </p>
    </div>
  ) : (
    <FileExplorer
      nodes={nodes}
      activeNodeId={activeNodeId}
      onOpen={(nodeId) => {
        setActiveNodeId(nodeId);
        if (isMobile) update({ leftOpen: false });
      }}
      onNewDocument={handleNewDocument}
      onNewChannel={handleNewChannel}
      onPopOutDocument={handlePopOutDocument}
      onNewFolder={handleNewFolder}
      onMoveToTrash={handleMoveToTrash}
      onRestore={handleRestore}
      onMoveTo={handleMoveTo}
      onRename={handleRename}
      onDeleteForever={handleDeleteForever}
      loading={treeLoading}
      error={treeError}
    />
  );

  /** Right panel tabs — AI only for now; add e.g. comments later. */
  const rightTabs = [{ id: "ai" as const, label: "AI assistant" }];
  const activeRightTab =
    rightTabs.find((t) => t.id === prefs.rightTab)?.id ?? "ai";

  const rightPanel = (
    <>
      {rightTabs.length > 1 && (
        <div className="flex border-b border-border text-sm">
          {rightTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => update({ rightTab: tab.id })}
              className={`flex-1 px-3 py-2 ${
                activeRightTab === tab.id
                  ? "border-b-2 border-accent font-medium"
                  : "text-muted hover:text-foreground"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {activeRightTab === "ai" && (
          <AiSidebar
            documentMarkdown={aiDocumentMarkdown}
            onApplyMarkdown={(markdown) => applyMarkdownRef.current(markdown)}
            onOpenSettings={() => setSettingsOpen(true)}
          />
        )}
      </div>
    </>
  );

  if (showTerminal) {
    return (
      <EditorPrefsProvider prefs={prefs} updatePrefs={update}>
        <DocumentSessionProvider value={sessionValue}>
          <TerminalCapture
            nodes={nodes}
            displayName={resolvedName}
            onEnterApp={enterAppSurface}
            refreshKey={shellRefreshKey}
            onRefreshTree={async () => {
              await refreshTree();
              bumpShellRefresh();
            }}
          />
        </DocumentSessionProvider>
      </EditorPrefsProvider>
    );
  }

  return (
    <EditorPrefsProvider prefs={prefs} updatePrefs={update}>
      <DocumentSessionProvider value={sessionValue}>
        <div className="flex h-dvh flex-col">
          <header className="flex h-11 shrink-0 items-center justify-between border-b border-border px-3">
            <div className="flex items-center gap-2">
              <button
                onClick={() => update({ leftOpen: !prefs.leftOpen })}
                title="Toggle file tree"
                className="rounded p-1.5 text-muted hover:bg-panel hover:text-foreground"
              >
                <PanelIcon side="left" />
              </button>
              <span className="inline-flex items-center gap-2 text-sm font-semibold tracking-tight">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/icons/blogide.svg"
                  alt=""
                  width={22}
                  height={22}
                  className="size-[22px]"
                  draggable={false}
                />
                BlogIDE
              </span>
              {!previewMode && (
                <ShellButton
                  nodes={nodes}
                  dockOpen={prefs.shellOpen && !isMobile}
                  onClick={openShell}
                  refreshKey={shellRefreshKey}
                />
              )}
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

          {syncBanner && (
            <div
              role="status"
              className="flex flex-wrap items-center gap-3 border-b border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm"
            >
              <span>{syncBanner.message}</span>
              {syncBanner.conflictCopyId && (
                <button
                  type="button"
                  className="rounded border border-border px-2 py-0.5 text-xs hover:bg-panel"
                  onClick={() => setActiveNodeId(syncBanner.conflictCopyId)}
                >
                  Open conflict copy
                </button>
              )}
            </div>
          )}

          <div className="relative flex min-h-0 flex-1">
            {/* Desktop left panel */}
            {prefs.leftOpen && (
              <>
                <aside
                  style={{ width: prefs.leftWidth }}
                  className="hidden shrink-0 overflow-y-auto border-r border-border bg-panel/60 md:block"
                >
                  {fileExplorer}
                </aside>
                <div
                  onPointerDown={() => startDrag("left")}
                  className="hidden w-1 shrink-0 cursor-col-resize hover:bg-accent/40 md:block"
                />
              </>
            )}

            {/* Mobile left drawer */}
            {isMobile && prefs.leftOpen && (
              <>
                <button
                  type="button"
                  aria-label="Close file tree"
                  className="absolute inset-0 z-30 bg-black/40 md:hidden"
                  onClick={() => update({ leftOpen: false })}
                />
                <aside
                  style={{ width: Math.min(prefs.leftWidth, 300) }}
                  className="absolute inset-y-0 left-0 z-40 overflow-y-auto border-r border-border bg-panel shadow-lg md:hidden"
                >
                  {fileExplorer}
                </aside>
              </>
            )}

            <main className="min-h-0 min-w-0 flex-1">
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
                shellDock={
                  !previewMode && prefs.shellOpen && !isMobile ? (
                    <ShellPanel
                      nodes={nodes}
                      height={prefs.shellHeight}
                      onResizeStart={() => startDrag("shell")}
                      onClose={() => update({ shellOpen: false })}
                      onPopOut={() => update({ shellOpen: false })}
                      refreshKey={shellRefreshKey}
                      onNotesChanged={bumpShellRefresh}
                    />
                  ) : null
                }
              />
            </main>

            {/* Desktop right panel */}
            {prefs.rightOpen && (
              <>
                <div
                  onPointerDown={() => startDrag("right")}
                  className="hidden w-1 shrink-0 cursor-col-resize hover:bg-accent/40 md:block"
                />
                <aside
                  style={{ width: prefs.rightWidth }}
                  className="hidden shrink-0 flex-col border-l border-border bg-panel/60 md:flex"
                >
                  {rightPanel}
                </aside>
              </>
            )}

            {/* Mobile right drawer */}
            {isMobile && prefs.rightOpen && (
              <>
                <button
                  type="button"
                  aria-label="Close right panel"
                  className="absolute inset-0 z-30 bg-black/40 md:hidden"
                  onClick={() => update({ rightOpen: false })}
                />
                <aside
                  style={{ width: Math.min(prefs.rightWidth, 320) }}
                  className="absolute inset-y-0 right-0 z-40 flex flex-col border-l border-border bg-panel shadow-lg md:hidden"
                >
                  {rightPanel}
                </aside>
              </>
            )}
          </div>

          <SettingsPanel
            open={settingsOpen}
            onClose={() => setSettingsOpen(false)}
            email={previewMode ? "" : userEmail}
            displayName={resolvedName}
            previewMode={previewMode}
            onDisplayNameChange={setAccountName}
          />
          <HelpPanel open={helpOpen} onClose={() => setHelpOpen(false)} />
          {!isMobile && (
            <PopOutLayer
              onOpenInEditor={setActiveNodeId}
              nodes={nodes}
              shellRefreshKey={shellRefreshKey}
              onShellNotesChanged={bumpShellRefresh}
              onShellPopIn={popShellIn}
            />
          )}
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

