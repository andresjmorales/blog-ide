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
import { SettingsPanel, type SettingsTab } from "@/components/SettingsPanel";
import { WorkspaceConnectionDialog } from "@/components/WorkspaceConnectionDialog";
import { WorkspaceBootSplash } from "@/components/WorkspaceBootSplash";
import { HelpPanel } from "@/components/HelpPanel";
import {
  classifyWorkspaceFailure,
  type WorkspaceFailureKind,
} from "@/lib/workspace/connectionError";
import {
  formatWorkspaceBootLabel,
  nextRetryDelaySec,
  shouldShowConnectionDialog,
} from "@/lib/workspace/bootPolicy";
import {
  loadCachedWorkspaceTree,
  saveCachedWorkspaceTree,
} from "@/lib/workspace/treeCache";
import { BOOT_SLOW_HINT_MS, withTimeout, WORKSPACE_READ_TIMEOUT_MS } from "@/lib/net/timeout";
import { UserMenu } from "@/components/UserMenu";
import { AiSidebar } from "@/components/AiSidebar";
import type { AiSelection } from "@/lib/ai/selection";
import { EditorPrefsProvider } from "@/components/EditorPrefsContext";
import { DocumentSessionProvider } from "@/components/DocumentSessionContext";
import { FileExplorer } from "@/components/FileExplorer";
import { UploadStatusBar } from "@/components/UploadStatusBar";
import { GitHubMapDialog } from "@/components/GitHubMapDialog";
import {
  ConflictResolverPanel,
  type ConflictResolutionSuccess,
} from "@/components/ConflictResolverPanel";
import { LibraryPanel } from "@/components/LibraryPanel";
import { DockRegion } from "@/components/panels/DockRegion";
import { PanelsMenu } from "@/components/panels/PanelsMenu";
import { FullscreenButton } from "@/components/FullscreenButton";
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
import { deleteLocalDoc, getLocalDoc } from "@/lib/db/indexed";
import {
  fileNameToTitle,
  titleToFileName,
  writeTitle,
} from "@/lib/markdown/titleFrontmatter";
import {
  joinFrontmatter,
  newEssayFrontmatter,
  splitFrontmatter,
} from "@/lib/markdown/frontmatter";
import {
  createWorkspaceNode,
  deleteWorkspaceNode,
  ensureDefaultWorkspace,
  listWorkspaceNodes,
  moveWorkspaceNode,
  renameWorkspaceNode,
  setWorkspaceNodeColor,
  setWorkspaceNodePinned,
} from "@/lib/workspace/api";
import {
  loadDocumentTitles,
  setTitleFromMarkdown,
} from "@/lib/workspace/docTitles";
import { pickEssayImportFile } from "@/lib/export/document";
import { downloadWorkspaceZip } from "@/lib/export/workspaceZip";
import { importPandocFile } from "@/lib/pandoc/client";
import { listGithubMapNodes } from "@/lib/github/files";
import {
  collectGithubDocumentBodies,
  inspectGithubPush,
  pushWorkspaceToGithubWithStatus,
} from "@/lib/github/push";
import { loadGithubMapStatuses } from "@/lib/github/health";
import {
  applyGithubPullToDocument,
  prepareGithubPull,
  type GithubPullFile,
} from "@/lib/github/pull";
import { remapGithubMaps, type GithubPushIssue } from "@/lib/github/status";
import {
  loadGithubSettings,
  saveGithubSettings,
} from "@/lib/github/settings";
import { loadGithubToken } from "@/lib/github/token";
import { startPushbulletCapture } from "@/lib/pushbullet/runtime";
import { startNtfyCapture } from "@/lib/ntfy/runtime";
import { hydrateAccountSecrets } from "@/lib/secrets/client";
import { NOTES_CHANGED_EVENT } from "@/lib/capture/seen";
import type { GithubMapStatus, GithubSyncMap } from "@/lib/github/types";
import { GitHubPullDialog, type GithubPullApply } from "@/components/GitHubPullDialog";
import {
  GitHubPushWarningDialog,
  type GithubPushRemap,
} from "@/components/GitHubPushWarningDialog";
import {
  documentIdsInSubtree,
  getInboxNode,
  getTrashNode,
  isInTrash,
  isSystemFolder,
  listInboxChannels,
  channelDisplayName,
  pickDefaultOpenDocument,
  uniqueSiblingName,
} from "@/lib/workspace/tree";
import {
  loadActiveDocumentId,
  saveActiveDocumentId,
} from "@/lib/workspace/activeDocument";
import type { WorkspaceNode } from "@/lib/workspace/types";
import { classifyConflict } from "@/lib/workspace/conflicts";
import {
  formatSyncLabel,
  getSyncStatus,
  openDocument,
  saveLocal,
  subscribeSyncStatus,
  syncDocument,
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
  isDockablePanelPinOpen,
  openShellPin,
  openToolPanelPin,
} from "@/lib/pins/pinStore";
import {
  closePanel,
  dockHasVisiblePanels,
  movePanel,
  PANEL_LABELS,
  popInPanel,
  popOutPanel,
  setActiveTab,
  setDockSize,
  showPanel,
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
  // Refresh relative "Synced 6h30m ago" without waiting for another sync event.
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
  avatarUrl,
}: {
  userEmail: string;
  displayName?: string;
  avatarUrl?: string | null;
}) {
  return (
    <AppDialogProvider>
      <AppShellContent
        userEmail={userEmail}
        displayName={displayName}
        avatarUrl={avatarUrl}
      />
    </AppDialogProvider>
  );
}

function AppShellContent({
  userEmail,
  displayName,
  avatarUrl: initialAvatarUrl = null,
}: {
  userEmail: string;
  displayName?: string;
  avatarUrl?: string | null;
}) {
  const router = useRouter();
  const previewMode = !isSupabaseConfigured() || userEmail === "not signed in";
  const [storedPrefs, setPrefs] = useState(() =>
    mergePrefs(typeof window === "undefined" ? {} : loadLocalPrefs())
  );
  const hydrated = useHydrated();
  const isMobile = useIsMobileViewport();
  // Always merge defaults so new keys (e.g. allowMarkdownOnly) stay defined
  // even when localStorage / in-memory state predates them.
  const prefs = mergePrefs(hydrated ? storedPrefs : {});
  const dragging = useRef<"left" | "right" | "shell" | null>(null);
  const prefsRef = useRef(storedPrefs);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("account");
  const [helpOpen, setHelpOpen] = useState(false);
  // Mobile drawers are session-local and default closed: phones open to a
  // clean editor, and toggling them never rewrites the synced desktop layout.
  const [mobileLeftOpen, setMobileLeftOpen] = useState(false);
  const mobileSurface = useStoredMobileSurface();
  const [shellRefreshKey, setShellRefreshKey] = useState(0);
  const getMarkdownForAiRef = useRef<() => string | null>(() => null);
  const applyMarkdownRef = useRef<(markdown: string) => void>(() => {});
  const getSelectionForAiRef = useRef<() => AiSelection | null>(() => null);
  const applySelectionForAiRef = useRef<
    (markdown: string, selection: AiSelection) => boolean
  >(() => false);
  const flushDocumentRef = useRef<() => Promise<void>>(async () => {});
  const [githubMapOpen, setGithubMapOpen] = useState(false);
  const [githubMapInitial, setGithubMapInitial] = useState<{
    nodeId: string;
    existing: GithubSyncMap | null;
    defaultRepo: string;
    defaultBranch: string;
  } | null>(null);
  const [githubStatuses, setGithubStatuses] = useState<GithubMapStatus[]>([]);
  const [githubEpoch, setGithubEpoch] = useState(0);
  const [pullOpen, setPullOpen] = useState(false);
  const [pullFiles, setPullFiles] = useState<GithubPullFile[]>([]);
  const [pullUnmapped, setPullUnmapped] = useState<
    Array<{ repo: string; branch: string; path: string; looksLike?: string }>
  >([]);
  const [pullBusy, setPullBusy] = useState(false);
  const [pullError, setPullError] = useState<string | null>(null);
  const [pushWarnOpen, setPushWarnOpen] = useState(false);
  const [pushIssues, setPushIssues] = useState<GithubPushIssue[]>([]);
  const [pushScope, setPushScope] = useState<"workspace" | { nodeId: string }>(
    "workspace"
  );
  const [pushBusy, setPushBusy] = useState(false);
  const [deletedFootnotes, setDeletedFootnotes] = useState<DeletedFootnote[]>(
    []
  );
  const restoreRef = useRef<(id: string) => void>(() => {});
  const dismissRef = useRef<(id: string) => void>(() => {});

  const [nodes, setNodes] = useState<WorkspaceNode[]>([]);
  const githubMapNodes = useMemo(() => listGithubMapNodes(nodes), [nodes]);
  const notesChannels = useMemo(
    () =>
      listInboxChannels(nodes).map((node) => ({
        id: node.id,
        name: channelDisplayName(node),
      })),
    [nodes]
  );
  const notesChannelKey = notesChannels
    .map((channel) => `${channel.id}:${channel.name}`)
    .join("|");
  const githubByNode = useMemo(() => {
    const map = new Map<string, GithubMapStatus>();
    for (const status of githubStatuses) {
      if (!status.stale) map.set(status.nodeId, status);
    }
    return map;
  }, [githubStatuses]);
  const [docTitles, setDocTitles] = useState<Map<string, string>>(
    () => new Map()
  );
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
  const [resolverCopyId, setResolverCopyId] = useState<string | null>(null);
  const [dismissedConflictId, setDismissedConflictId] = useState<string | null>(
    null
  );
  const [documentReloadKey, setDocumentReloadKey] = useState(0);
  const [treeLoading, setTreeLoading] = useState(!previewMode);
  const [treeError, setTreeError] = useState<string | null>(null);
  const [treeErrorKind, setTreeErrorKind] =
    useState<WorkspaceFailureKind>("unknown");
  /** Empty tree after wake/stale auth — keep prior nodes and offer Retry. */
  const [treeStale, setTreeStale] = useState(false);
  const [bootSlow, setBootSlow] = useState(false);
  const [bootAttempts, setBootAttempts] = useState(0);
  const [retryInSec, setRetryInSec] = useState<number | null>(null);
  const [offlineEssayId, setOfflineEssayId] = useState<string | null>(null);
  const [dismissedConnectionDialog, setDismissedConnectionDialog] =
    useState(false);
  const bootInFlightRef = useRef(false);
  const bootCancelledRef = useRef(false);
  const bootAttemptsRef = useRef(0);
  const countdownTimerRef = useRef<number | null>(null);
  const slowHintTimerRef = useRef<number | null>(null);
  const nodesRef = useRef<WorkspaceNode[]>([]);
  const pushbulletSessionRef = useRef<ReturnType<
    typeof startPushbulletCapture
  > | null>(null);
  const titlesRequestRef = useRef(0);
  const { status: syncStatus, label: syncLabel } = useSyncStatusLabel();
  const syncBanner = useStableSyncBanner(syncStatus);
  const dialog = useAppDialog();
  const {
    targets: panelTargets,
    register: registerPanelSlot,
    unregister: unregisterPanelSlot,
  } = usePanelTargets();
  const [accountName, setAccountName] = useState(displayName?.trim() ?? "");
  const [accountAvatarUrl, setAccountAvatarUrl] = useState<string | null>(
    initialAvatarUrl
  );
  const resolvedName =
    accountName.trim() ||
    displayName?.trim() ||
    (previewMode ? "Preview" : userEmail.split("@")[0] || "Account");
  const activeNode = nodes.find((n) => n.id === activeNodeId) ?? null;
  const activeConflict = useMemo(
    () => (activeNode ? classifyConflict(activeNode) : null),
    [activeNode]
  );
  const resolverCopyNode =
    nodes.find((node) => node.id === resolverCopyId) ?? null;
  const resolverOriginNode = resolverCopyNode?.conflict_of
    ? nodes.find((node) => node.id === resolverCopyNode.conflict_of) ?? null
    : null;

  useEffect(() => {
    prefsRef.current = storedPrefs;
  }, [storedPrefs]);

  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  useEffect(() => {
    if (previewMode) return;
    void hydrateAccountSecrets();
  }, [previewMode]);

  useEffect(() => {
    if (previewMode) return;
    const session = startPushbulletCapture(() => nodesRef.current);
    pushbulletSessionRef.current = session;
    const ntfy = startNtfyCapture();
    return () => {
      session.stop();
      ntfy.stop();
      pushbulletSessionRef.current = null;
    };
  }, [previewMode]);

  useEffect(() => {
    pushbulletSessionRef.current?.channelsChanged();
  }, [notesChannelKey]);

  useEffect(() => {
    function onNotesChanged() {
      setShellRefreshKey((k) => k + 1);
    }
    window.addEventListener(NOTES_CHANGED_EVENT, onNotesChanged);
    return () => {
      window.removeEventListener(NOTES_CHANGED_EVENT, onNotesChanged);
    };
  }, []);

  const refreshGithubStatuses = useCallback(async () => {
    if (previewMode) return;
    try {
      const settings = await loadGithubSettings();
      const statuses = await loadGithubMapStatuses({
        nodes: nodesRef.current,
        settings,
        token: loadGithubToken() || null,
      });
      setGithubStatuses(statuses);
    } catch {
      // Mapping badges are advisory; a failed check shouldn't block the editor.
    }
  }, [previewMode]);

  useEffect(() => {
    if (previewMode) return;
    const timer = window.setTimeout(() => {
      void refreshGithubStatuses();
    }, 80);
    return () => window.clearTimeout(timer);
  }, [previewMode, nodes, githubEpoch, refreshGithubStatuses]);

  const update = useCallback((patch: Partial<EditorPrefs>, persist = true) => {
    setPrefs((p) => {
      // Remerge defaults so newly added pref keys are never undefined on
      // long-lived state / older localStorage blobs (controlled inputs).
      const next = mergePrefs({ ...p, ...patch });
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

  /** Keep in-memory pin windows aligned with persisted layout.floating. */
  const syncFloatingPins = useCallback((layout: PanelLayout) => {
    for (const id of ["files", "ai", "shell", "library"] as PanelId[]) {
      const shouldFloat = layout.floating.includes(id);
      const open = isDockablePanelPinOpen(id);
      if (shouldFloat === open) continue;
      if (shouldFloat) {
        if (id === "shell") openShellPin();
        else openToolPanelPin(id, PANEL_LABELS[id]);
      } else {
        closeDockablePanelPin(id);
      }
    }
  }, []);

  const applyLayout = useCallback(
    (next: PanelLayout, persist = true) => {
      syncFloatingPins(next);
      commitLayout(next, persist);
    },
    [commitLayout, syncFloatingPins]
  );

  // Prefs restore floating ids across refresh; pin windows are session-only
  // until this runs and re-opens them.
  const floatingKey = panelLayout.floating.join("|");
  useEffect(() => {
    syncFloatingPins(panelLayout);
    // Membership of floating panels only — not dock sizes / active tabs.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- floatingKey
  }, [floatingKey, syncFloatingPins]);

  const bumpShellRefresh = useCallback(() => {
    setShellRefreshKey((k) => k + 1);
  }, [setShellRefreshKey]);

  const enterAppSurface = useCallback(() => {
    saveMobileSurface("app");
  }, []);

  const enterCaptureSurface = useCallback(() => {
    saveMobileSurface("capture");
    setMobileLeftOpen(false);
  }, [setMobileLeftOpen]);

  /** Phone: full-screen capture terminal. Desktop uses the Notes panel tab. */
  const openShell = useCallback(() => {
    enterCaptureSurface();
  }, [enterCaptureSurface]);

  const handlePopInPanel = useCallback(
    (panelId: PanelId, side: DockSide) => {
      applyLayout(
        popInPanel(prefsRef.current.panelLayout, panelId, side)
      );
    },
    [applyLayout]
  );

  const handleFloatClosed = useCallback(
    (panelId: PanelId) => {
      commitLayout(closePanel(prefsRef.current.panelLayout, panelId));
    },
    [commitLayout]
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

  const refreshDocTitles = useCallback((list: WorkspaceNode[]) => {
    const requestId = ++titlesRequestRef.current;
    void loadDocumentTitles(list).then((titles) => {
      if (titlesRequestRef.current === requestId) setDocTitles(titles);
    });
  }, [setDocTitles]);

  const handleExplorerTitleChange = useCallback(
    (nodeId: string, title: string) => {
      setDocTitles((prev) => {
        const next = new Map(prev);
        next.set(nodeId, title);
        return next;
      });
    },
    [setDocTitles]
  );

  const handleDocumentLoaded = useCallback(
    (markdown: string) => {
      if (!activeNodeId) return;
      setDocTitles((prev) => setTitleFromMarkdown(prev, activeNodeId, markdown));
    },
    [activeNodeId, setDocTitles]
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
        refreshDocTitles(list);
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
    [
      previewMode,
      refreshDocTitles,
      setNodes,
      setTreeError,
      setTreeStale,
    ]
  );

  function handleReviewConflict(copyId: string) {
    setResolverCopyId(copyId);
  }

  const refreshedConflictRef = useRef<string | null>(null);
  useEffect(() => {
    const copyId = syncStatus.conflictCopyId;
    if (!copyId || refreshedConflictRef.current === copyId) return;
    refreshedConflictRef.current = copyId;
    void refreshTree();
  }, [syncStatus.conflictCopyId, refreshTree]);

  async function handleConflictResolved(result: ConflictResolutionSuccess) {
    setDismissedConflictId(result.copyId);
    if (result.resolution === "keep_both") {
      setActiveNodeId(result.copyId);
    } else {
      setActiveNodeId(result.originId);
      // Clean drafts fetch the authoritative RPC result; genuinely newer
      // local typing remains dirty and is never discarded by resolution UI.
      setDocumentReloadKey((key) => key + 1);
    }
    await refreshTree();
  }

  /** Revalidate auth after idle tabs (Firefox throttles token refresh). */
  const recoverWorkspace = useCallback(async () => {
    if (previewMode) return;
    if (bootInFlightRef.current) return;
    try {
      await withTimeout(
        (async () => {
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
        })(),
        WORKSPACE_READ_TIMEOUT_MS
      );
    } catch {
      if (nodesRef.current.length > 0) setTreeStale(true);
    }
  }, [previewMode, refreshTree, setTreeStale]);

  // Remember the open essay across refreshes (skip null so boot can restore).
  useEffect(() => {
    if (previewMode || !activeNodeId) return;
    saveActiveDocumentId(activeNodeId);
  }, [activeNodeId, previewMode]);

  const clearBootTimers = useCallback(() => {
    if (countdownTimerRef.current != null) {
      window.clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    if (slowHintTimerRef.current != null) {
      window.clearTimeout(slowHintTimerRef.current);
      slowHintTimerRef.current = null;
    }
  }, []);

  const openRememberedDocument = useCallback(
    (list: WorkspaceNode[], scratchpadId?: string | null) => {
      const remembered = loadActiveDocumentId();
      const rememberedOk =
        remembered != null &&
        list.some(
          (node) =>
            node.id === remembered &&
            node.kind === "document" &&
            !isInTrash(node.id, list)
        );
      setActiveNodeId((current) => {
        if (current) return current;
        if (rememberedOk) return remembered;
        return pickDefaultOpenDocument(list, { scratchpadId });
      });
    },
    [setActiveNodeId]
  );

  const hydrateCachedTree = useCallback(() => {
    if (nodesRef.current.length > 0) return;
    const cached = loadCachedWorkspaceTree(userEmail);
    if (!cached?.nodes.length) return;
    setNodes(cached.nodes);
    refreshDocTitles(cached.nodes);
    openRememberedDocument(cached.nodes, cached.scratchpadId);
  }, [openRememberedDocument, refreshDocTitles, setNodes, userEmail]);

  const scheduleBootRetry = useCallback(
    (delaySec: number, retry: () => void) => {
      clearBootTimers();
      let remaining = delaySec;
      setRetryInSec(remaining);
      countdownTimerRef.current = window.setInterval(() => {
        remaining -= 1;
        if (remaining <= 0) {
          if (countdownTimerRef.current != null) {
            window.clearInterval(countdownTimerRef.current);
            countdownTimerRef.current = null;
          }
          setRetryInSec(null);
          retry();
          return;
        }
        setRetryInSec(remaining);
      }, 1000);
    },
    [clearBootTimers]
  );

  const bootWorkspace = useCallback(async () => {
    if (previewMode) return false;
    if (bootInFlightRef.current) return false;
    bootInFlightRef.current = true;
    clearBootTimers();
    setRetryInSec(null);
    setTreeLoading(true);
    setBootSlow(false);
    slowHintTimerRef.current = window.setTimeout(() => {
      setBootSlow(true);
    }, BOOT_SLOW_HINT_MS);

    hydrateCachedTree();

    let failedKind: WorkspaceFailureKind | null = null;
    try {
      const ids = await ensureDefaultWorkspace();
      const list = await listWorkspaceNodes();
      setNodes(list);
      refreshDocTitles(list);
      openRememberedDocument(list, ids.scratchpadId);
      saveCachedWorkspaceTree(userEmail, list, ids.scratchpadId ?? null);
      setTreeError(null);
      setTreeErrorKind("unknown");
      setTreeStale(false);
      setBootAttempts(0);
      bootAttemptsRef.current = 0;
      setOfflineEssayId(null);
      setDismissedConnectionDialog(false);
      return true;
    } catch (error) {
      const nextAttempts = bootAttemptsRef.current + 1;
      bootAttemptsRef.current = nextAttempts;
      setBootAttempts(nextAttempts);
      failedKind = classifyWorkspaceFailure(error);
      setTreeErrorKind(failedKind);
      setTreeError(
        error instanceof Error
          ? error.message
          : "Could not reach BlogIDE’s cloud workspace."
      );
      if (nodesRef.current.length === 0) {
        const remembered = loadActiveDocumentId();
        if (remembered) {
          void getLocalDoc(remembered).then((local) => {
            if (local) setOfflineEssayId(remembered);
          });
        }
      }
      return false;
    } finally {
      if (slowHintTimerRef.current != null) {
        window.clearTimeout(slowHintTimerRef.current);
        slowHintTimerRef.current = null;
      }
      setBootSlow(false);
      setTreeLoading(false);
      bootInFlightRef.current = false;
      const retryable =
        failedKind === "network" || failedKind === "unknown";
      if (
        !bootCancelledRef.current &&
        retryable &&
        bootAttemptsRef.current > 0
      ) {
        scheduleBootRetry(nextRetryDelaySec(bootAttemptsRef.current), () => {
          void bootWorkspace();
        });
      }
    }
  }, [
    clearBootTimers,
    hydrateCachedTree,
    openRememberedDocument,
    previewMode,
    refreshDocTitles,
    scheduleBootRetry,
    setActiveNodeId,
    setNodes,
    setTreeError,
    setTreeErrorKind,
    setTreeLoading,
    setTreeStale,
    userEmail,
  ]);

  useEffect(() => {
    if (previewMode) return;
    // Defer: bootWorkspace setStates; sync call in effect trips set-state-in-effect.
    bootCancelledRef.current = false;
    let cancelled = false;
    const id = window.setTimeout(() => {
      if (cancelled) return;
      void bootWorkspace();
    }, 0);
    function onOnline() {
      if (cancelled) return;
      void bootWorkspace();
    }
    window.addEventListener("online", onOnline);
    return () => {
      cancelled = true;
      bootCancelledRef.current = true;
      window.clearTimeout(id);
      window.removeEventListener("online", onOnline);
      clearBootTimers();
    };
  }, [previewMode, bootWorkspace, clearBootTimers]);

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
      secondaryLabel: "Import from file (.md, .txt, .docx)",
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

  async function handleNewChannel() {
    if (previewMode) return;
    const inboxId = getInboxNode(nodes)?.id;
    if (!inboxId) {
      setTreeError("Notes folder is not ready yet.");
      return;
    }
    const name = await dialog.prompt({
      title: "New channel",
      message: "Name for this Notes channel (e.g. ideas, quotes).",
      defaultValue: "channel",
      confirmLabel: "Create",
    });
    if (!name?.trim()) return;
    const title = name.trim().replace(/\.md$/i, "");
    const fileName = uniqueSiblingName(nodes, inboxId, titleToFileName(title));
    try {
      await createWorkspaceNode({
        kind: "document",
        name: fileName,
        parentId: inboxId,
        markdown: `---\ntitle: ${title}\nstatus: draft\n---\n\n`,
      });
      await refreshTree();
      bumpShellRefresh();
      applyLayout(showPanel(panelLayout, "shell"));
    } catch (error) {
      setTreeError(
        error instanceof Error ? error.message : "Could not create channel."
      );
    }
  }

  function handleOpenChannelDoc(channelId: string) {
    setActiveNodeId(channelId);
    if (isMobile) setMobileLeftOpen(false);
  }

  function handlePopOutDocument(nodeId: string) {
    const node = nodes.find((n) => n.id === nodeId);
    if (!node || node.kind !== "document") return;
    openPopOut(nodeId, fileNameToTitle(node.name));
  }

  async function handleImportDocument(parentId: string | null) {
    if (previewMode) return;
    const picked = await pickEssayImportFile();
    if (!picked) return;
    const baseName = picked.name
      .replace(/\.(md|markdown|txt|docx|odt)$/i, "")
      .trim();
    const title = baseName || "Imported";
    const fileName = uniqueSiblingName(nodes, parentId, titleToFileName(title));
    let markdown: string;
    if (picked.kind === "office") {
      try {
        markdown = await importPandocFile(picked.file);
      } catch (error) {
        setTreeError(
          error instanceof Error ? error.message : "Could not import Word file."
        );
        return;
      }
    } else {
      markdown = picked.markdown.replace(/^\uFEFF/, "");
    }
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

  async function handleMapToGithub(nodeId: string) {
    if (previewMode) return;
    try {
      const settings = await loadGithubSettings();
      setGithubMapInitial({
        nodeId,
        existing: settings.maps.find((m) => m.nodeId === nodeId) ?? null,
        defaultRepo: settings.repo,
        defaultBranch: settings.branch,
      });
      setGithubMapOpen(true);
    } catch (error) {
      await dialog.confirm({
        title: "GitHub mapping",
        message:
          error instanceof Error
            ? error.message
            : "Could not load GitHub settings.",
        confirmLabel: "OK",
        cancelLabel: "Close",
      });
    }
  }

  async function handleSaveGithubMap(map: GithubSyncMap) {
    try {
      const settings = await loadGithubSettings();
      await saveGithubSettings({
        ...settings,
        maps: [...settings.maps.filter((m) => m.nodeId !== map.nodeId), map],
      });
      setGithubEpoch((value) => value + 1);
    } catch (error) {
      await dialog.confirm({
        title: "Could not save mapping",
        message:
          error instanceof Error ? error.message : "GitHub settings failed.",
        confirmLabel: "OK",
        cancelLabel: "Close",
      });
    }
  }

  async function actuallyPush(scope: "workspace" | { nodeId: string }) {
    const results = await pushWorkspaceToGithubWithStatus({ scope });
    const files = results.reduce((n, r) => n + r.fileCount, 0);
    await dialog.confirm({
      title: "Pushed to GitHub",
      message: `Wrote ${files} file${
        files === 1 ? "" : "s"
      }. Matching paths were overwritten; extra files in the repo were left alone.`,
      confirmLabel: "OK",
      cancelLabel: "Close",
    });
    setGithubEpoch((value) => value + 1);
  }

  async function handlePushToGithub(
    scope: "workspace" | { nodeId: string }
  ) {
    if (previewMode) return;
    await flushDocumentRef.current();
    try {
      const { issues } = await inspectGithubPush({ scope });
      if (issues.length > 0) {
        setPushScope(scope);
        setPushIssues(issues);
        setPushWarnOpen(true);
        return;
      }
      await actuallyPush(scope);
    } catch (error) {
      await dialog.confirm({
        title: "GitHub push failed",
        message:
          error instanceof Error ? error.message : "Could not push to GitHub.",
        confirmLabel: "OK",
        cancelLabel: "Close",
      });
    }
  }

  async function handlePushAnyway() {
    setPushBusy(true);
    try {
      setPushWarnOpen(false);
      await actuallyPush(pushScope);
    } catch (error) {
      await dialog.confirm({
        title: "GitHub push failed",
        message:
          error instanceof Error ? error.message : "Could not push to GitHub.",
        confirmLabel: "OK",
        cancelLabel: "Close",
      });
    } finally {
      setPushBusy(false);
    }
  }

  async function handleRemapAndPush(updates: GithubPushRemap[]) {
    setPushBusy(true);
    try {
      const settings = await loadGithubSettings();
      await saveGithubSettings({
        ...settings,
        maps: remapGithubMaps(settings.maps, updates),
      });
      setPushWarnOpen(false);
      await actuallyPush(pushScope);
    } catch (error) {
      await dialog.confirm({
        title: "GitHub push failed",
        message:
          error instanceof Error ? error.message : "Could not push to GitHub.",
        confirmLabel: "OK",
        cancelLabel: "Close",
      });
    } finally {
      setPushBusy(false);
    }
  }

  async function handlePullFromGithub(
    scope: "workspace" | { nodeId: string }
  ) {
    if (previewMode) return;
    await flushDocumentRef.current();
    setPullError(null);
    try {
      const token = loadGithubToken();
      if (!token) {
        throw new Error(
          "Add a GitHub personal access token in Settings. It stays on this device."
        );
      }
      const [settings, tree, bodies] = await Promise.all([
        loadGithubSettings(),
        Promise.resolve(nodesRef.current),
        collectGithubDocumentBodies(nodesRef.current),
      ]);
      const plan = await prepareGithubPull({
        nodes: tree,
        settings,
        token,
        localBodies: bodies,
        scope,
      });
      const known = new Set(tree.map((node) => node.id));
      if (plan.files.some((file) => !known.has(file.nodeId))) {
        throw new Error(
          "Pull refused to touch an unknown essay. BlogIDE never creates files from GitHub."
        );
      }
      setPullFiles(plan.files);
      setPullUnmapped(plan.unmapped);
      setPullOpen(true);
    } catch (error) {
      await dialog.confirm({
        title: "GitHub pull failed",
        message:
          error instanceof Error
            ? error.message
            : "Could not read from GitHub.",
        confirmLabel: "OK",
        cancelLabel: "Close",
      });
    }
  }

  async function handleApplyGithubPull(result: GithubPullApply) {
    setPullBusy(true);
    setPullError(null);
    try {
      const mappingUpdates = result.files
        .filter((file) => file.updateMapping)
        .map((file) => ({
          nodeId: file.nodeId,
          path: file.pullPath,
          repo: file.repo,
          branch: file.branch,
        }));
      if (mappingUpdates.length > 0) {
        const settings = await loadGithubSettings();
        await saveGithubSettings({
          ...settings,
          maps: remapGithubMaps(settings.maps, mappingUpdates),
        });
      }
      for (const file of result.files) {
        await applyGithubPullToDocument({
          nodeId: file.nodeId,
          markdown: file.markdown,
          isOpen: file.nodeId === activeNodeId,
          nodes: nodesRef.current,
          applyMarkdown: applyMarkdownRef.current,
        });
      }
      setPullOpen(false);
      setGithubEpoch((value) => value + 1);
      refreshDocTitles(nodesRef.current);
    } catch (error) {
      setPullError(
        error instanceof Error ? error.message : "Could not apply GitHub file."
      );
    } finally {
      setPullBusy(false);
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
    if (!node || isSystemFolder(node)) return;
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
    if (!node || isSystemFolder(node)) return;

    const currentTitle =
      node.kind === "document"
        ? docTitles.get(nodeId)?.trim() || fileNameToTitle(node.name)
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

    const typedTitle = next.trim().replace(/\.md$/i, "") || "Untitled";

    if (node.kind === "document") {
      const newName = uniqueSiblingName(
        nodes,
        node.parent_id,
        titleToFileName(typedTitle),
        node.id
      );
      try {
        // Write the exact typed title into frontmatter before renaming so the
        // open-editor filename→title effect does not collapse "Document: 2"
        // into "Document 2". Persist immediately so refreshDocTitles sees it.
        let markdown: string;
        let baseVersion: number;
        if (activeNodeId === nodeId) {
          const current = getMarkdownForAiRef.current();
          if (current != null) {
            markdown = current;
            const local = await getLocalDoc(nodeId);
            baseVersion = local?.baseVersion ?? 1;
          } else {
            const opened = await openDocument(nodeId);
            markdown = opened.markdown;
            baseVersion = opened.baseVersion;
          }
        } else {
          const opened = await openDocument(nodeId);
          markdown = opened.markdown;
          baseVersion = opened.baseVersion;
        }
        const split = splitFrontmatter(markdown);
        const nextMarkdown = joinFrontmatter({
          frontmatter: writeTitle(split.frontmatter, typedTitle),
          body: split.body,
        });
        if (nextMarkdown !== markdown) {
          await saveLocal(nodeId, nextMarkdown, baseVersion);
          void syncDocument(nodeId);
        }
        if (activeNodeId === nodeId) {
          applyMarkdownRef.current(nextMarkdown);
        }
        setDocTitles((prev) => {
          const nextMap = new Map(prev);
          nextMap.set(nodeId, typedTitle);
          return nextMap;
        });
        if (node.name !== newName) {
          await renameWorkspaceNode(nodeId, newName);
        }
        await refreshTree();
      } catch (error) {
        setTreeError(
          error instanceof Error ? error.message : "Could not rename."
        );
      }
      return;
    }

    const newName = uniqueSiblingName(
      nodes,
      node.parent_id,
      next.trim(),
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

  async function handleRenameDocument(
    nodeId: string,
    fileName: string
  ): Promise<string | void> {
    if (previewMode) return;
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return;
    const finalName = uniqueSiblingName(
      nodes,
      node.parent_id,
      fileName,
      node.id
    );
    if (node.name === finalName) return finalName;
    await renameWorkspaceNode(nodeId, finalName);
    await refreshTree();
    return finalName;
  }

  async function handleTogglePin(nodeId: string, pinned: boolean) {
    if (previewMode) return;
    const node = nodes.find((n) => n.id === nodeId);
    if (!node || isSystemFolder(node)) return;
    try {
      await setWorkspaceNodePinned(nodeId, pinned);
      await refreshTree();
    } catch (error) {
      setTreeError(
        error instanceof Error ? error.message : "Could not update pin."
      );
    }
  }

  async function handleSetColor(nodeId: string, color: string | null) {
    if (previewMode) return;
    const node = nodes.find((n) => n.id === nodeId);
    if (!node || isSystemFolder(node)) return;
    try {
      await setWorkspaceNodeColor(nodeId, color);
      await refreshTree();
    } catch (error) {
      setTreeError(
        error instanceof Error ? error.message : "Could not update color."
      );
    }
  }

  async function handleDeleteForever(nodeId: string) {
    if (previewMode) return;
    const node = nodes.find((n) => n.id === nodeId);
    if (!node || isSystemFolder(node)) return;
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

  const bootLabel = formatWorkspaceBootLabel({
    inFlight: treeLoading,
    failedAttempts: bootAttempts,
    retryInSec,
    slow: bootSlow,
  });

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
      docTitles={docTitles}
      onOpen={(nodeId) => {
        setActiveNodeId(nodeId);
        if (isMobile) setMobileLeftOpen(false);
      }}
      onNewDocument={handleNewDocument}
      onPopOutDocument={handlePopOutDocument}
      onNewFolder={handleNewFolder}
      onMoveToTrash={handleMoveToTrash}
      onRestore={handleRestore}
      onMoveTo={handleMoveTo}
      onRename={handleRename}
      onTogglePin={handleTogglePin}
      onSetColor={handleSetColor}
      onDeleteForever={handleDeleteForever}
      onReviewConflict={handleReviewConflict}
      onExportAll={previewMode ? undefined : () => void exportAll()}
      onMapToGithub={previewMode ? undefined : (id) => void handleMapToGithub(id)}
      onPushToGithub={
        previewMode ? undefined : (id) => void handlePushToGithub({ nodeId: id })
      }
      onPullFromGithub={
        previewMode ? undefined : (id) => void handlePullFromGithub({ nodeId: id })
      }
      githubByNode={githubByNode}
      loading={treeLoading || (retryInSec != null && nodes.length === 0)}
      loadingLabel={bootLabel}
      // Hard boot failures use WorkspaceConnectionDialog instead of a red blurb.
      error={
        treeError && nodes.length === 0 ? null : treeError
      }
    />
  );

  const connectionBlocked =
    !previewMode &&
    !dismissedConnectionDialog &&
    shouldShowConnectionDialog(bootAttempts, nodes.length > 0);

  const libraryPanel = <LibraryPanel />;

  const aiPanel = (
    <AiSidebar
      essayAvailable={Boolean(previewMode || activeNodeId)}
      getDocumentMarkdown={() => getMarkdownForAiRef.current()}
      getSelection={() => getSelectionForAiRef.current()}
      onApplyMarkdown={(markdown) => applyMarkdownRef.current(markdown)}
      onApplySelection={(markdown, selection) =>
        applySelectionForAiRef.current(markdown, selection)
      }
      onOpenSettings={() => {
        setSettingsTab("integrations");
        setSettingsOpen(true);
      }}
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

  /** Mobile drawer: Files left only (Library is desktop; Notes uses Shell). */
  const mobileFilesDrawer = fileExplorer;

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
              {!isMobile && <FullscreenButton />}
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
              {isMobile && !previewMode && (
                <ShellButton
                  nodes={nodes}
                  dockOpen={false}
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
                avatarUrl={accountAvatarUrl}
                previewMode={previewMode}
                onAccountSettings={() => {
                  setSettingsTab("account");
                  setSettingsOpen(true);
                }}
                onHelp={() => setHelpOpen(true)}
                onSignOut={() => void signOut()}
              />
            </div>
          </header>

          {(treeStale || (bootAttempts > 0 && nodes.length > 0)) && (
            <div
              role="status"
              className="flex flex-wrap items-center gap-3 border-b border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm"
            >
              <span>
                {bootAttempts > 0 && nodes.length > 0
                  ? `${bootLabel} Essays on this device are still here.`
                  : "Workspace files may be out of date after the tab was idle. Your open essay is still local. Retry before making tree changes."}
              </span>
              <button
                type="button"
                className="rounded border border-border px-2 py-0.5 text-xs hover:bg-panel"
                onClick={() =>
                  void (bootAttempts > 0 ? bootWorkspace() : recoverWorkspace())
                }
              >
                {treeLoading ? "Retrying…" : "Retry"}
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

          {syncBanner &&
            syncBanner.conflictCopyId !== dismissedConflictId && (
            <div
              role="status"
              className="flex flex-wrap items-center gap-3 border-b border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm"
            >
              <span>{syncBanner.message}</span>
              {syncBanner.conflictCopyId && (
                <button
                  type="button"
                  className="rounded border border-border px-2 py-0.5 text-xs hover:bg-panel"
                  onClick={() => {
                    if (syncBanner.conflictCopyId) {
                      handleReviewConflict(syncBanner.conflictCopyId);
                    }
                  }}
                >
                  Review conflict
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

            <main className="relative min-h-0 min-w-0 flex-1">
              {!previewMode &&
              !activeNodeId &&
              (treeLoading ||
                connectionBlocked ||
                retryInSec != null ||
                bootAttempts > 0) ? (
                <div className="absolute inset-0 z-10 bg-background">
                  <WorkspaceBootSplash
                    label={bootLabel}
                    retryInSec={retryInSec}
                  />
                </div>
              ) : null}
              <DocumentWorkspace
                key={`${previewMode ? "preview" : activeNodeId}-${documentReloadKey}`}
                nodeId={previewMode ? null : activeNodeId}
                documentName={activeNode?.name ?? null}
                githubMapped={Boolean(
                  activeNodeId && githubByNode.has(activeNodeId)
                )}
                githubStatus={
                  activeNodeId
                    ? githubByNode.get(activeNodeId)
                    : undefined
                }
                githubSettingsEpoch={githubEpoch}
                onGithubSettingsChanged={() =>
                  setGithubEpoch((value) => value + 1)
                }
                onPullFromGithub={
                  previewMode || !activeNodeId
                    ? undefined
                    : () =>
                        void handlePullFromGithub({ nodeId: activeNodeId })
                }
                conflict={activeConflict}
                onReviewConflict={
                  activeConflict?.resolvable && activeNodeId
                    ? () => handleReviewConflict(activeNodeId)
                    : undefined
                }
                previewMode={previewMode}
                onDeletedFootnotesChange={setDeletedFootnotes}
                registerDeletedActions={registerDeletedActions}
                onDocumentLoaded={handleDocumentLoaded}
                onExplorerTitleChange={handleExplorerTitleChange}
                onRequestTreeRefresh={refreshTree}
                onRenameDocument={handleRenameDocument}
                registerGetMarkdownForAi={(get) => {
                  getMarkdownForAiRef.current = get;
                }}
                registerApplyMarkdown={(apply) => {
                  applyMarkdownRef.current = apply;
                }}
                registerGetSelectionForAi={(get) => {
                  getSelectionForAiRef.current = get;
                }}
                registerApplySelectionForAi={(apply) => {
                  applySelectionForAiRef.current = apply;
                }}
                registerFlushDocument={(flush) => {
                  flushDocumentRef.current = flush;
                }}
                onPushToGithub={
                  previewMode || !activeNodeId
                    ? undefined
                    : () => void handlePushToGithub({ nodeId: activeNodeId })
                }
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

          </div>

          <SettingsPanel
            open={settingsOpen}
            onClose={() => setSettingsOpen(false)}
            initialTab={settingsTab}
            email={previewMode ? "" : userEmail}
            displayName={resolvedName}
            avatarUrl={accountAvatarUrl}
            previewMode={previewMode}
            onDisplayNameChange={setAccountName}
            onAvatarUrlChange={setAccountAvatarUrl}
            githubMapNodes={githubMapNodes}
            githubMapStatuses={githubStatuses}
            githubSettingsEpoch={githubEpoch}
            onGithubSettingsChanged={() => setGithubEpoch((value) => value + 1)}
            onPushWorkspace={
              previewMode
                ? undefined
                : () => void handlePushToGithub("workspace")
            }
            onPullMapped={
              previewMode
                ? undefined
                : () => void handlePullFromGithub("workspace")
            }
            pushbulletChannels={notesChannels}
          />
          <WorkspaceConnectionDialog
            open={connectionBlocked}
            kind={treeErrorKind}
            detail={treeError}
            retrying={treeLoading}
            retryInSec={retryInSec}
            onContinueOffline={
              offlineEssayId
                ? () => {
                    setActiveNodeId(offlineEssayId);
                    setDismissedConnectionDialog(true);
                  }
                : null
            }
            onRetry={() => {
              void bootWorkspace();
            }}
          />
          <HelpPanel open={helpOpen} onClose={() => setHelpOpen(false)} />
          <GitHubMapDialog
            open={githubMapOpen}
            onClose={() => {
              setGithubMapOpen(false);
              setGithubMapInitial(null);
            }}
            nodes={githubMapNodes}
            initialNodeId={githubMapInitial?.nodeId}
            existing={githubMapInitial?.existing}
            defaultRepo={githubMapInitial?.defaultRepo ?? ""}
            defaultBranch={githubMapInitial?.defaultBranch ?? "main"}
            onSave={(map) => {
              void handleSaveGithubMap(map);
            }}
          />
          <GitHubPullDialog
            open={pullOpen}
            files={pullFiles}
            unmapped={pullUnmapped}
            busy={pullBusy}
            error={pullError}
            onClose={() => {
              if (!pullBusy) setPullOpen(false);
            }}
            onApply={(result) => {
              void handleApplyGithubPull(result);
            }}
          />
          <GitHubPushWarningDialog
            open={pushWarnOpen}
            issues={pushIssues}
            busy={pushBusy}
            onClose={() => {
              if (!pushBusy) setPushWarnOpen(false);
            }}
            onPushAnyway={() => {
              void handlePushAnyway();
            }}
            onRemapAndPush={(updates) => {
              void handleRemapAndPush(updates);
            }}
          />
          <UploadStatusBar />
          <ConflictResolverPanel
            open={Boolean(resolverCopyId)}
            copyNode={resolverCopyNode}
            originNode={resolverOriginNode}
            onClose={() => setResolverCopyId(null)}
            onResolved={handleConflictResolved}
          />
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
                  onNewChannel={() => void handleNewChannel()}
                  onOpenChannelDoc={handleOpenChannelDoc}
                  onRenameChannel={(id) => void handleRename(id)}
                  onTrashChannel={(id) => void handleMoveToTrash(id)}
                />
              </PersistentPanel>
              <PersistentPanel
                target={panelTargets.library}
                className="min-h-0 flex-1 overflow-y-auto"
              >
                {libraryPanel}
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

