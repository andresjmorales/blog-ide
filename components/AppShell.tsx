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
import { DockRegion } from "@/components/panels/DockRegion";
import { PanelsMenu } from "@/components/panels/PanelsMenu";
import {
  PersistentPanel,
  usePanelTargets,
} from "@/components/panels/PersistentPanel";
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
import { newEssayFrontmatter } from "@/lib/markdown/frontmatter";
import {
  createWorkspaceNode,
  deleteWorkspaceNode,
  ensureDefaultWorkspace,
  listWorkspaceNodes,
  moveWorkspaceNode,
  renameWorkspaceNode,
  setWorkspaceNodePinned,
} from "@/lib/workspace/api";
import { pickMarkdownFile } from "@/lib/export/document";
import { downloadWorkspaceZip } from "@/lib/export/workspaceZip";
import {
  documentIdsInSubtree,
  getTrashNode,
  isInTrash,
  isScratchpad,
  isSystemFolder,
  uniqueSiblingName,
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
import { ShellChat } from "@/components/shell/ShellChat";
import {
  loadMobileSurface,
  saveMobileSurface,
  subscribeMobileSurface,
  type MobileSurface,
} from "@/lib/capture/mobileSurface";
import {
  closeDockablePanelPin,
  openShellPin,
  openToolPanelPin,
} from "@/lib/pins/pinStore";
import {
  closePanel,
  dockHasVisiblePanels,
  isPanelDocked,
  movePanel,
  PANEL_LABELS,
  popInPanel,
  popOutPanel,
  setActiveTab,
  setDockSize,
  togglePanel,
  type DockSide,
  type PanelId,
  type PanelLayout,
} from "@/lib/panels/layout";

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
  const [nowTick, setNowTick] = useState(0);
  useEffect(() => subscribeSyncStatus(setStatus), []);
  // Refresh relative "Synced Xm ago" without waiting for another sync event.
  useEffect(() => {
    const id = window.setInterval(() => setNowTick((n) => n + 1), 30_000);
    return () => window.clearInterval(id);
  }, []);
  // nowTick forces a re-read of relative times ("just now" → "1m ago").
  void nowTick;
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
  // Mobile drawers are session-local and default closed: phones open to a
  // clean editor, and toggling them never rewrites the synced desktop layout.
  const [mobileLeftOpen, setMobileLeftOpen] = useState(false);
  const [mobileRightOpen, setMobileRightOpen] = useState(false);
  const mobileSurface = useStoredMobileSurface();
  const [shellRefreshKey, setShellRefreshKey] = useState(0);
  const getMarkdownForAiRef = useRef<() => string | null>(() => null);
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
  /** Empty tree after wake/stale auth — keep prior nodes and offer Retry. */
  const [treeStale, setTreeStale] = useState(false);
  const nodesRef = useRef<WorkspaceNode[]>([]);
  const { status: syncStatus, label: syncLabel } = useSyncStatusLabel();
  const syncBanner = useStableSyncBanner(syncStatus);
  const dialog = useAppDialog();
  const {
    targets: panelTargets,
    register: registerPanelSlot,
    unregister: unregisterPanelSlot,
  } = usePanelTargets();
  const [accountName, setAccountName] = useState(displayName?.trim() ?? "");
  const resolvedName =
    accountName.trim() ||
    displayName?.trim() ||
    (previewMode ? "Preview" : userEmail.split("@")[0] || "Account");
  const activeNode = nodes.find((n) => n.id === activeNodeId) ?? null;

  useEffect(() => {
    prefsRef.current = storedPrefs;
  }, [storedPrefs]);

  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  const update = useCallback((patch: Partial<EditorPrefs>, persist = true) => {
    setPrefs((p) => {
      const next = { ...p, ...patch };
      if (persist) savePrefs(next);
      return next;
    });
  }, []);

  const panelLayout = prefs.panelLayout;

  const commitLayout = useCallback(
    (next: PanelLayout, persist = true) => {
      update(
        {
          panelLayout: next,
          leftWidth: next.sizes.left,
          rightWidth: next.sizes.right,
          shellHeight: next.sizes.bottom,
          leftOpen: next.visible.files,
          rightOpen: next.visible.ai,
          shellOpen: next.visible.shell,
        },
        persist
      );
    },
    [update]
  );

  const syncFloatingPins = useCallback(
    (prev: PanelLayout, next: PanelLayout) => {
      for (const id of ["files", "ai", "shell"] as PanelId[]) {
        const was = prev.floating.includes(id);
        const now = next.floating.includes(id);
        if (was === now) continue;
        if (now) {
          if (id === "shell") openShellPin();
          else openToolPanelPin(id, PANEL_LABELS[id]);
        } else {
          closeDockablePanelPin(id);
        }
      }
    },
    []
  );

  const applyLayout = useCallback(
    (next: PanelLayout, persist = true) => {
      syncFloatingPins(panelLayout, next);
      commitLayout(next, persist);
    },
    [commitLayout, panelLayout, syncFloatingPins]
  );

  const bumpShellRefresh = useCallback(() => {
    setShellRefreshKey((k) => k + 1);
  }, []);

  const enterAppSurface = useCallback(() => {
    saveMobileSurface("app");
  }, []);

  const enterCaptureSurface = useCallback(() => {
    saveMobileSurface("capture");
    setMobileLeftOpen(false);
    setMobileRightOpen(false);
  }, []);

  /** Desktop: always pop-out. Phone: full-screen terminal. */
  const openShell = useCallback(() => {
    if (isMobile) {
      enterCaptureSurface();
      return;
    }
    applyLayout(popOutPanel(panelLayout, "shell"));
  }, [applyLayout, enterCaptureSurface, isMobile, panelLayout]);

  const handlePopInPanel = useCallback(
    (panelId: PanelId, side: DockSide) => {
      applyLayout(popInPanel(panelLayout, panelId, side));
    },
    [applyLayout, panelLayout]
  );

  const handleFloatClosed = useCallback(
    (panelId: PanelId) => {
      commitLayout(closePanel(panelLayout, panelId));
    },
    [commitLayout, panelLayout]
  );

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

  const refreshTree = useCallback(
    async (opts?: { allowEmptyWipe?: boolean }) => {
      if (previewMode) return false;
      try {
        const list = await listWorkspaceNodes();
        // Stale/missing session often returns [] with no error under RLS —
        // don't blank a tree the user already had loaded.
        if (
          list.length === 0 &&
          nodesRef.current.length > 0 &&
          !opts?.allowEmptyWipe
        ) {
          setTreeStale(true);
          return false;
        }
        setNodes(list);
        setTreeError(null);
        setTreeStale(false);
        return true;
      } catch (error) {
        setTreeError(
          error instanceof Error ? error.message : "Could not load files."
        );
        return false;
      }
    },
    [previewMode]
  );

  /** Revalidate auth after idle tabs (Firefox throttles token refresh). */
  const recoverWorkspace = useCallback(async () => {
    if (previewMode) return;
    try {
      const supabase = createClient();
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        await supabase.auth.refreshSession();
      } else {
        // Nudge refresh so a near-expiry token is renewed on wake.
        const expiresAt = sessionData.session.expires_at ?? 0;
        if (expiresAt * 1000 < Date.now() + 60_000) {
          await supabase.auth.refreshSession();
        }
      }
      const ok = await refreshTree();
      if (!ok && nodesRef.current.length > 0) {
        setTreeStale(true);
      }
    } catch {
      if (nodesRef.current.length > 0) setTreeStale(true);
    }
  }, [previewMode, refreshTree]);

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
        setTreeStale(false);
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

  // Anchor the header/toolbar: the app scrolls in inner panes, so lock the
  // page itself while the shell is mounted.
  useEffect(() => {
    document.documentElement.classList.add("app-shell-lock");
    return () => document.documentElement.classList.remove("app-shell-lock");
  }, []);

  // iOS ignores interactive-widget=resizes-content: when the keyboard opens
  // it pans the page instead, sliding the header off-screen. Track the
  // visual viewport height into --app-height (the shell root uses it) and
  // undo any pan, so the caret scrolls inside the editor pane instead.
  useEffect(() => {
    if (!isMobile) return;
    const viewport = window.visualViewport;
    if (!viewport) return;
    const root = document.documentElement;
    function apply() {
      if (!viewport) return;
      root.style.setProperty("--app-height", `${Math.round(viewport.height)}px`);
      if (window.scrollY || window.scrollX) window.scrollTo(0, 0);
    }
    apply();
    viewport.addEventListener("resize", apply);
    viewport.addEventListener("scroll", apply);
    return () => {
      viewport.removeEventListener("resize", apply);
      viewport.removeEventListener("scroll", apply);
      root.style.removeProperty("--app-height");
    };
  }, [isMobile]);

  // Ask the browser to exempt this origin from storage eviction — Safari
  // purges script-writable storage (incl. IndexedDB drafts) after ~7 days
  // without a visit otherwise. Best-effort; browsers may ignore it.
  useEffect(() => {
    if (previewMode) return;
    try {
      void navigator.storage?.persist?.();
    } catch {
      // Older browsers without the Storage API.
    }
  }, [previewMode]);

  useEffect(() => {
    if (previewMode) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    function scheduleRecover() {
      if (document.visibilityState !== "visible") return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        void recoverWorkspace();
      }, 120);
    }

    function onPageShow(event: PageTransitionEvent) {
      if (event.persisted) scheduleRecover();
    }

    document.addEventListener("visibilitychange", scheduleRecover);
    window.addEventListener("focus", scheduleRecover);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", scheduleRecover);
      window.removeEventListener("focus", scheduleRecover);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [previewMode, recoverWorkspace]);

  useEffect(() => {
    function onMove(e: PointerEvent) {
      if (!dragging.current) return;
      if (dragging.current === "left") {
        const w = Math.min(MAX_PANEL, Math.max(MIN_PANEL, e.clientX));
        setPrefs((p) => ({
          ...p,
          leftWidth: w,
          panelLayout: setDockSize(p.panelLayout, "left", w),
        }));
      } else if (dragging.current === "right") {
        const w = Math.min(
          MAX_PANEL,
          Math.max(MIN_PANEL, window.innerWidth - e.clientX)
        );
        setPrefs((p) => ({
          ...p,
          rightWidth: w,
          panelLayout: setDockSize(p.panelLayout, "right", w),
        }));
      } else if (dragging.current === "shell") {
        const h = Math.min(
          MAX_SHELL,
          Math.max(MIN_SHELL, window.innerHeight - e.clientY)
        );
        setPrefs((p) => ({
          ...p,
          shellHeight: h,
          panelLayout: setDockSize(p.panelLayout, "bottom", h),
        }));
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

  async function exportAll() {
    if (previewMode) return;
    try {
      const count = await downloadWorkspaceZip();
      if (count === 0) {
        await dialog.confirm({
          title: "Nothing to export",
          message: "No essays outside the Trash yet.",
          confirmLabel: "OK",
          cancelLabel: "Close",
        });
      }
    } catch (error) {
      await dialog.confirm({
        title: "Export failed",
        message:
          error instanceof Error
            ? error.message
            : "Could not build the export archive.",
        confirmLabel: "OK",
        cancelLabel: "Close",
      });
    }
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
    const fileName = uniqueSiblingName(nodes, parentId, titleToFileName(title));
    try {
      const id = await createWorkspaceNode({
        kind: "document",
        name: fileName,
        parentId,
        // Title lives in frontmatter + the Title field — not as Heading 1.
        markdown: newEssayFrontmatter(title),
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
    const fileName = uniqueSiblingName(nodes, inboxId, titleToFileName(title));
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
    const fileName = uniqueSiblingName(nodes, parentId, titleToFileName(title));
    let markdown = picked.markdown.replace(/^\uFEFF/, "");
    if (!/^---\s*\n/.test(markdown)) {
      markdown = newEssayFrontmatter(title) + markdown;
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
    if (!name?.trim()) return;
    try {
      await createWorkspaceNode({
        kind: "folder",
        name: uniqueSiblingName(nodes, parentId, name.trim()),
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

    const newName = uniqueSiblingName(
      nodes,
      node.parent_id,
      node.kind === "document" ? titleToFileName(next) : next.trim(),
      node.id
    );
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
    await renameWorkspaceNode(
      nodeId,
      uniqueSiblingName(nodes, node.parent_id, fileName, node.id)
    );
    await refreshTree();
  }

  async function handleTogglePin(nodeId: string, pinned: boolean) {
    if (previewMode) return;
    const node = nodes.find((n) => n.id === nodeId);
    if (!node || isSystemFolder(node) || isScratchpad(node)) return;
    try {
      await setWorkspaceNodePinned(nodeId, pinned);
      await refreshTree();
    } catch (error) {
      setTreeError(
        error instanceof Error ? error.message : "Could not update pin."
      );
    }
  }

  async function handleDeleteForever(nodeId: string) {
    if (previewMode) return;
    const node = nodes.find((n) => n.id === nodeId);
    if (!node || isScratchpad(node) || isSystemFolder(node)) return;
    // Only items already in the Trash can be destroyed permanently.
    if (!isInTrash(nodeId, nodes)) return;

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
        if (isMobile) setMobileLeftOpen(false);
      }}
      onNewDocument={handleNewDocument}
      onNewChannel={handleNewChannel}
      onPopOutDocument={handlePopOutDocument}
      onNewFolder={handleNewFolder}
      onMoveToTrash={handleMoveToTrash}
      onRestore={handleRestore}
      onMoveTo={handleMoveTo}
      onRename={handleRename}
      onTogglePin={handleTogglePin}
      onDeleteForever={handleDeleteForever}
      onExportAll={previewMode ? undefined : () => void exportAll()}
      loading={treeLoading}
      error={treeError}
    />
  );

  const aiPanel = (
    <AiSidebar
      essayAvailable={Boolean(previewMode || activeNodeId)}
      getDocumentMarkdown={() => getMarkdownForAiRef.current()}
      onApplyMarkdown={(markdown) => applyMarkdownRef.current(markdown)}
      onOpenSettings={() => setSettingsOpen(true)}
    />
  );


  const dockHandlers = {
    onSelectTab: (side: DockSide) => (id: PanelId) => {
      commitLayout(setActiveTab(panelLayout, side, id));
    },
    onMoveTo: (id: PanelId, side: DockSide) => {
      applyLayout(movePanel(panelLayout, id, side));
    },
    onPopOut: (id: PanelId) => {
      applyLayout(popOutPanel(panelLayout, id));
    },
    onClose: (id: PanelId) => {
      applyLayout(closePanel(panelLayout, id));
    },
  };

  /** Mobile drawers still use Files / AI content without dock chrome. */
  const mobileFilesDrawer = fileExplorer;
  const mobileAiDrawer = aiPanel;

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
        <div
          className="flex h-dvh flex-col"
          style={{ height: "var(--app-height, 100dvh)" }}
        >
          <header className="relative flex h-11 shrink-0 items-center justify-between border-b border-border px-3">
            <div className="z-10 flex items-center gap-2">
              {isMobile ? (
                <button
                  onClick={() => setMobileLeftOpen((v) => !v)}
                  title="Toggle Files"
                  className="rounded p-1.5 text-muted hover:bg-panel hover:text-foreground"
                >
                  <PanelIcon side="left" />
                </button>
              ) : (
                <PanelsMenu
                  layout={panelLayout}
                  onToggle={(id) => applyLayout(togglePanel(panelLayout, id))}
                />
              )}
              {!previewMode && (
                <ShellButton
                  nodes={nodes}
                  dockOpen={isPanelDocked(panelLayout, "shell") && !isMobile}
                  onClick={openShell}
                  refreshKey={shellRefreshKey}
                />
              )}
            </div>
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
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
            </div>
            <div className="z-10 flex items-center gap-2 text-xs text-muted">
              <span
                className={`hidden items-center gap-1.5 sm:inline-flex ${
                  syncStatus.error ? "text-red-600 dark:text-red-400" : ""
                }`}
                title={syncStatus.error ?? syncStatus.message ?? undefined}
              >
                {previewMode ? "Preview mode · not synced" : syncLabel}
                {!previewMode && <SyncStateIcon status={syncStatus} />}
              </span>
              {!previewMode && (
                <span
                  className="inline-flex items-center sm:hidden"
                  title={syncStatus.error ?? syncLabel}
                  aria-label={syncStatus.error ?? syncLabel}
                  role="status"
                >
                  <SyncStateIcon status={syncStatus} />
                </span>
              )}
              <UserMenu
                displayName={resolvedName}
                email={previewMode ? "" : userEmail}
                previewMode={previewMode}
                onAccountSettings={() => setSettingsOpen(true)}
                onHelp={() => setHelpOpen(true)}
                onSignOut={() => void signOut()}
              />
              {isMobile && (
                <button
                  onClick={() => setMobileRightOpen((v) => !v)}
                  title="Toggle AI"
                  className="rounded p-1.5 text-muted hover:bg-panel hover:text-foreground"
                >
                  <PanelIcon side="right" />
                </button>
              )}
            </div>
          </header>

          {treeStale && (
            <div
              role="status"
              className="flex flex-wrap items-center gap-3 border-b border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm"
            >
              <span>
                Workspace files may be out of date after the tab was idle.
                Your open essay is still local — Retry before making tree
                changes.
              </span>
              <button
                type="button"
                className="rounded border border-border px-2 py-0.5 text-xs hover:bg-panel"
                onClick={() => void recoverWorkspace()}
              >
                Retry
              </button>
              <button
                type="button"
                className="rounded border border-border px-2 py-0.5 text-xs hover:bg-panel"
                onClick={() => window.location.reload()}
              >
                Reload app
              </button>
            </div>
          )}

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
            {/* Desktop left dock */}
            {!isMobile && dockHasVisiblePanels(panelLayout, "left") && (
              <>
                <aside
                  style={{ width: panelLayout.sizes.left }}
                  className="hidden min-h-0 shrink-0 flex-col border-r border-border md:flex"
                >
                  <DockRegion
                    side="left"
                    layout={panelLayout}
                    registerSlot={registerPanelSlot}
                    unregisterSlot={unregisterPanelSlot}
                    onSelectTab={dockHandlers.onSelectTab("left")}
                    onMoveTo={dockHandlers.onMoveTo}
                    onPopOut={dockHandlers.onPopOut}
                    onClose={dockHandlers.onClose}
                    className="min-h-0 flex-1"
                  />
                </aside>
                <div
                  onPointerDown={() => startDrag("left")}
                  className="hidden w-1 shrink-0 cursor-col-resize hover:bg-accent/40 md:block"
                />
              </>
            )}

            {/* Mobile left drawer */}
            {isMobile && mobileLeftOpen && (
              <>
                <button
                  type="button"
                  aria-label="Close file tree"
                  className="absolute inset-0 z-30 bg-black/40 md:hidden"
                  onClick={() => setMobileLeftOpen(false)}
                />
                <aside
                  style={{ width: Math.min(prefs.leftWidth, 300) }}
                  className="absolute inset-y-0 left-0 z-40 overflow-y-auto border-r border-border bg-panel shadow-lg md:hidden"
                >
                  <p className="border-b border-border px-3 py-2 text-xs font-medium text-muted">
                    Files
                  </p>
                  {mobileFilesDrawer}
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
                registerGetMarkdownForAi={(get) => {
                  getMarkdownForAiRef.current = get;
                }}
                registerApplyMarkdown={(apply) => {
                  applyMarkdownRef.current = apply;
                }}
                shellDock={
                  !previewMode &&
                  !isMobile &&
                  dockHasVisiblePanels(panelLayout, "bottom") ? (
                    <DockRegion
                      side="bottom"
                      layout={panelLayout}
                      registerSlot={registerPanelSlot}
                      unregisterSlot={unregisterPanelSlot}
                      onSelectTab={dockHandlers.onSelectTab("bottom")}
                      onMoveTo={dockHandlers.onMoveTo}
                      onPopOut={dockHandlers.onPopOut}
                      onClose={dockHandlers.onClose}
                      onResizeStart={() => startDrag("shell")}
                      className="w-full shrink-0 border-t border-border bg-panel/95"
                      style={{ height: panelLayout.sizes.bottom }}
                    />
                  ) : null
                }
              />
            </main>

            {/* Desktop right dock */}
            {!isMobile && dockHasVisiblePanels(panelLayout, "right") && (
              <>
                <div
                  onPointerDown={() => startDrag("right")}
                  className="hidden w-1 shrink-0 cursor-col-resize hover:bg-accent/40 md:block"
                />
                <aside
                  style={{ width: panelLayout.sizes.right }}
                  className="hidden min-h-0 shrink-0 flex-col border-l border-border md:flex"
                >
                  <DockRegion
                    side="right"
                    layout={panelLayout}
                    registerSlot={registerPanelSlot}
                    unregisterSlot={unregisterPanelSlot}
                    onSelectTab={dockHandlers.onSelectTab("right")}
                    onMoveTo={dockHandlers.onMoveTo}
                    onPopOut={dockHandlers.onPopOut}
                    onClose={dockHandlers.onClose}
                    className="min-h-0 flex-1"
                  />
                </aside>
              </>
            )}

            {/* Mobile right drawer */}
            {isMobile && mobileRightOpen && (
              <>
                <button
                  type="button"
                  aria-label="Close right panel"
                  className="absolute inset-0 z-30 bg-black/40 md:hidden"
                  onClick={() => setMobileRightOpen(false)}
                />
                <aside
                  style={{ width: Math.min(prefs.rightWidth, 320) }}
                  className="absolute inset-y-0 right-0 z-40 flex flex-col border-l border-border bg-panel shadow-lg md:hidden"
                >
                  <p className="border-b border-border px-3 py-2 text-xs font-medium text-muted">
                    AI assistant
                  </p>
                  {mobileAiDrawer}
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
            <>
              <PersistentPanel
                target={panelTargets.files}
                className="min-h-0 flex-1 overflow-y-auto"
              >
                {fileExplorer}
              </PersistentPanel>
              <PersistentPanel target={panelTargets.ai}>
                {aiPanel}
              </PersistentPanel>
              <PersistentPanel target={panelTargets.shell}>
                <ShellChat
                  nodes={nodes}
                  refreshKey={shellRefreshKey}
                  onNotesChanged={bumpShellRefresh}
                  compactMeta
                />
              </PersistentPanel>
              <PopOutLayer
                onOpenInEditor={setActiveNodeId}
                onPopInPanel={handlePopInPanel}
                onFloatClosed={handleFloatClosed}
                registerPanelSlot={registerPanelSlot}
                unregisterPanelSlot={unregisterPanelSlot}
              />
            </>
          )}
        </div>
      </DocumentSessionProvider>
    </EditorPrefsProvider>
  );
}

function CheckCircle({ className }: { className: string }) {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden className={className}>
      <circle cx="8" cy="8" r="7" fill="currentColor" />
      <path
        d="M4.8 8.2l2.2 2.2 4.2-4.6"
        fill="none"
        stroke="var(--background)"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Sync state at a glance (mobile badge + desktop label suffix):
 * gray check = edits saved locally, cloud push pending;
 * spinner = pushing; accent check = synced; red = error.
 */
function SyncStateIcon({ status }: { status: SyncStatus }) {
  if (!status.focusNodeId) return null;

  if (status.error) {
    return (
      <svg
        width="15"
        height="15"
        viewBox="0 0 16 16"
        aria-hidden
        className="text-red-600 dark:text-red-400"
      >
        <circle cx="8" cy="8" r="7" fill="currentColor" />
        <path
          d="M8 4.5v4.2M8 11.4v.2"
          stroke="var(--background)"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  if (status.syncing) {
    return (
      <svg
        width="15"
        height="15"
        viewBox="0 0 16 16"
        aria-hidden
        className="animate-spin text-muted"
      >
        <circle
          cx="8"
          cy="8"
          r="6"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          opacity="0.25"
        />
        <path
          d="M14 8a6 6 0 0 0-6-6"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  // Typing / debounce window: saved locally, cloud copy now stale.
  if (status.dirty) {
    return <CheckCircle className="text-muted/70" />;
  }

  if (status.syncedAt) {
    return <CheckCircle className="text-accent" />;
  }

  return null;
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

