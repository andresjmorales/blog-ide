"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Editor } from "@tiptap/core";
import { DocumentEditor } from "@/components/DocumentEditor";
import {
  EditorOverflowMenu,
  type OverflowItem,
} from "@/components/EditorOverflowMenu";
import { useEditorPrefs } from "@/components/EditorPrefsContext";
import { openPublicationPreviewTab } from "@/lib/preview/publicationHtml";
import {
  CleanupDialog,
  type CleanupTab,
} from "@/components/CleanupDialog";
import { splitFrontmatter } from "@/lib/markdown/frontmatter";
import { compactDiff, unifiedLineDiff } from "@/lib/markdown/diff";
import {
  isLossy,
  normalize,
  previewRoundTrip,
  serializeBody,
} from "@/lib/markdown/pipeline";
import type { DeletedFootnote } from "@/lib/markdown/deletedFootnotes";
import { getLocalDoc } from "@/lib/db/indexed";
import {
  fastForwardDocument,
  flushSyncQueue,
  openDocument,
  saveLocal,
  setSyncFocus,
  subscribeCrossTabConflict,
  subscribeSyncStatus,
  syncDocument,
} from "@/lib/sync/engine";
import { restoreDocumentRevision } from "@/lib/workspace/api";
import { VersionHistoryPanel } from "@/components/VersionHistoryPanel";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import {
  parseSpellcheckLangs,
  parseSpellcheckOverride,
  primaryLang,
  resolveSpellcheckEnabled,
  writeSpellcheckLangs,
  writeSpellcheckOverride,
  type SpellcheckOverride,
} from "@/lib/markdown/spellcheckFrontmatter";
import {
  fileNameMatchesTitle,
  fileNameToTitle,
  parseTitle,
  titleToFileName,
  writeTitle,
} from "@/lib/markdown/titleFrontmatter";
import { normalizeEssayTitle } from "@/lib/markdown/docTitle";
import {
  migrateLegacySubtitle,
  parseSubtitle,
  writeSubtitle,
} from "@/lib/markdown/subtitle";
import { parseAuthor, writeAuthor } from "@/lib/markdown/author";
import {
  parsePublication,
  writePublication,
} from "@/lib/markdown/publication";
import { EssaySettingsPanel } from "@/components/EssaySettingsPanel";
import { EssayTitleBlock } from "@/components/EssayTitleBlock";
import { MarkdownSplitView } from "@/components/MarkdownSplitView";
import { convertMarkdownFootnoteLinks } from "@/lib/import/footnotePaste";
import { getActiveProvider, loadAiKeys } from "@/lib/ai/keys";
import { chatCompletion, IMPORT_CLEANUP_SYSTEM, unwrapMarkdownReply } from "@/lib/ai/client";
import {
  getSourceSelection,
  getWysiwygSelection,
  replaceSourceRange,
  replaceWysiwygRange,
  type AiSelection,
} from "@/lib/ai/selection";
import { useAppDialog } from "@/components/AppDialog";
import {
  copyDocumentForPaste,
  copyMarkdownToClipboard,
  downloadMarkdown,
} from "@/lib/export/document";
import {
  htmlForPublishTarget,
  PUBLISH_COPY_TARGETS,
  type PublishCopyTarget,
} from "@/lib/export/clipboardHtml";
import {
  exportMarkdownAsDocx,
} from "@/lib/pandoc/client";
import { pushWorkspaceToGithubWithStatus } from "@/lib/github/push";
import { openPopOut } from "@/lib/pins/popOutStore";
import {
  formatConflictTimestamp,
  type ConflictPresentation,
} from "@/lib/workspace/conflicts";

const SAMPLE_DOC = `---
title: Welcome to BlogIDE
status: draft
---

This is preview mode. Connect Supabase to persist documents.
`;

function unpackDocument(
  markdown: string,
  fallbackFileName?: string | null
) {
  const normalized = normalizeEssayTitle(markdown, fallbackFileName);
  const legacy = migrateLegacySubtitle(normalized.body);
  let frontmatter = normalized.frontmatter;
  let subtitle = parseSubtitle(frontmatter);
  if (!subtitle && legacy.subtitle) {
    subtitle = legacy.subtitle;
    frontmatter = writeSubtitle(frontmatter, subtitle);
  }
  const author = parseAuthor(frontmatter);
  const publication = parsePublication(frontmatter);
  // Whitespace-only bodies render identically to empty ones but defeat the
  // editor's is-empty detection (placeholder missing, stray caret line).
  const body = legacy.body.trim() === "" ? "" : legacy.body;
  const changed =
    normalized.changed ||
    frontmatter !== normalized.frontmatter ||
    legacy.body !== normalized.body ||
    body !== legacy.body;
  return {
    frontmatter,
    subtitle,
    author,
    publication,
    body,
    title: normalized.title,
    changed,
  };
}

function packDocument(
  frontmatter: string,
  subtitle: string,
  author: string,
  publication: string,
  body: string
): string {
  const fm = writePublication(
    writeAuthor(writeSubtitle(frontmatter, subtitle), author),
    publication
  );
  if (!fm) return body;
  // Blank line between the closing --- and the essay content.
  return `${fm}\n${body.replace(/^\n+/, "")}`;
}

type Mode = "wysiwyg" | "split" | "source";

function isMarkdownCanonical(mode: Mode): boolean {
  return mode === "split" || mode === "source";
}

function preferMarkdownOnlyPane(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(max-width: 767px)").matches
  );
}

type Props = {
  nodeId: string | null;
  /** Current workspace file name for the open document (e.g. essay.md). */
  documentName?: string | null;
  /** When false, title edits won't rename the file. */
  canRenameDocument?: boolean;
  conflict?: ConflictPresentation | null;
  onReviewConflict?: () => void;
  previewMode?: boolean;
  onDeletedFootnotesChange: (deleted: DeletedFootnote[]) => void;
  registerDeletedActions: (actions: {
    restore: (id: string) => void;
    dismiss: (id: string) => void;
  }) => void;
  onDocumentLoaded?: (markdown: string) => void;
  /** Keep the Files tab label in sync when the essay title changes. */
  onExplorerTitleChange?: (nodeId: string, title: string) => void;
  onRequestTreeRefresh?: () => void;
  onRenameDocument?: (
    nodeId: string,
    fileName: string
  ) => Promise<string | void>;
  /** Pull current essay markdown when the AI sidebar sends / cleans. */
  registerGetMarkdownForAi?: (get: () => string | null) => void;
  registerApplyMarkdown?: (apply: (markdown: string) => void) => void;
  registerGetSelectionForAi?: (get: () => AiSelection | null) => void;
  registerApplySelectionForAi?: (
    apply: (markdown: string, selection: AiSelection) => boolean
  ) => void;
  /** Flush the open essay to IndexedDB (GitHub push, etc.). */
  registerFlushDocument?: (flush: () => Promise<void>) => void;
  /** Docked under the prose column (between Outline and sidenotes). */
  shellDock?: ReactNode;
};

export function DocumentWorkspace({
  nodeId,
  documentName = null,
  canRenameDocument = true,
  conflict = null,
  onReviewConflict,
  previewMode = false,
  onDeletedFootnotesChange,
  registerDeletedActions,
  onDocumentLoaded,
  onExplorerTitleChange,
  onRequestTreeRefresh,
  onRenameDocument,
  registerGetMarkdownForAi,
  registerApplyMarkdown,
  registerGetSelectionForAi,
  registerApplySelectionForAi,
  registerFlushDocument,
  shellDock,
}: Props) {
  const dialog = useAppDialog();
  const [{ frontmatter, subtitle, author, publication, body }, setDoc] =
    useState(() => {
      const unpacked = unpackDocument(SAMPLE_DOC);
      return {
        frontmatter: unpacked.frontmatter,
        subtitle: unpacked.subtitle,
        author: unpacked.author,
        publication: unpacked.publication,
        body: unpacked.body,
      };
    });
  const documentNameRef = useRef(documentName);
  const [mode, setMode] = useState<Mode>("wysiwyg");
  const modeRef = useRef(mode);
  const [sourceText, setSourceText] = useState("");
  const [outlineOpen, setOutlineOpen] = useState(true);
  /** Outline/sidenotes before entering split/source — restored on exit. */
  const [railsSnapshot, setRailsSnapshot] = useState<{
    outlineOpen: boolean;
    sidenotes: boolean;
  } | null>(null);
  /** Apply sidenotes restore after render (avoid updatePrefs during render). */
  const [pendingSidenotesRestore, setPendingSidenotesRestore] = useState<
    boolean | null
  >(null);
  const [lossyDiffOpen, setLossyDiffOpen] = useState(false);
  const [essaySettingsOpen, setEssaySettingsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [cleanupOpen, setCleanupOpen] = useState(false);
  const [cleanupTab, setCleanupTab] = useState<CleanupTab>("import");
  const [cleanupEditor, setCleanupEditor] = useState<Editor | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [baseVersion, setBaseVersion] = useState(1);
  const editorRef = useRef<Editor | null>(null);
  const sourceTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const flushMarkdownRef = useRef<(() => void) | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Markdown handed to persistMarkdown but not yet written to IndexedDB. */
  const pendingLocalRef = useRef<{ nodeId: string; markdown: string } | null>(
    null
  );
  /** Last markdown written locally — skip no-op saves from flush paths. */
  const lastPersistedRef = useRef<string | null>(null);
  const baseVersionRef = useRef(1);
  const nodeIdRef = useRef(nodeId);
  const syncingNameRef = useRef(false);
  const prevDocumentNameRef = useRef<string | null | undefined>(documentName);
  const { prefs, updatePrefs } = useEditorPrefs();
  const persistEnabled = isSupabaseConfigured() && !previewMode && !!nodeId;
  const documentLanguages = parseSpellcheckLangs(frontmatter);
  const spellcheckOverride = parseSpellcheckOverride(frontmatter);
  const spellcheckEnabled = resolveSpellcheckEnabled(
    spellcheckOverride,
    prefs.spellcheckEnabled
  );
  const spellcheckLanguages =
    documentLanguages.length > 0
      ? documentLanguages
      : prefs.spellcheckLanguages;
  const spellcheckLang = primaryLang(spellcheckLanguages);
  const essayTitle =
    parseTitle(frontmatter) ??
    (documentName ? fileNameToTitle(documentName) : "Untitled");
  const persistMarkdownRef = useRef<(full: string) => void>(() => {});
  const onRenameRef = useRef(onRenameDocument);
  // Mirror of doc state so event-time flushes can pack markdown without
  // waiting on a React render (setState updaters run async).
  const docRef = useRef({ frontmatter, subtitle, author, publication, body });
  useEffect(() => {
    docRef.current = { frontmatter, subtitle, author, publication, body };
  });

  // Reset during render when switching docs so the previous essay never paints /
  // autosaves under the new id (avoids setState-in-effect).
  const [docNodeId, setDocNodeId] = useState(nodeId);
  if (docNodeId !== nodeId) {
    setDocNodeId(nodeId);
    setDoc({
      frontmatter: "---\ntitle: Untitled\nstatus: draft\n---\n",
      subtitle: "",
      author: "",
      publication: "",
      body: "",
    });
    // Clear the previous document's raw markdown so a source-mode switch can
    // never render (and then autosave) the old essay under the new id. The
    // loader repopulates it once the new document arrives.
    setSourceText("");
    // Always open the new document in rich text, even if the previous one
    // was being viewed as raw markdown.
    setMode("wysiwyg");
    if (railsSnapshot) {
      setOutlineOpen(railsSnapshot.outlineOpen);
      setPendingSidenotesRestore(railsSnapshot.sidenotes);
      setRailsSnapshot(null);
    }
    setLoading(Boolean(persistEnabled && nodeId));
    setLoadError(null);
  }

  useEffect(() => {
    if (pendingSidenotesRestore === null) return;
    const sidenotes = pendingSidenotesRestore;
    const timer = window.setTimeout(() => {
      updatePrefs({ sidenotes });
      setPendingSidenotesRestore(null);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [pendingSidenotesRestore, updatePrefs]);

  useEffect(() => {
    onRenameRef.current = onRenameDocument;
  }, [onRenameDocument]);

  useEffect(() => {
    documentNameRef.current = documentName;
  }, [documentName]);

  useEffect(() => {
    baseVersionRef.current = baseVersion;
  }, [baseVersion]);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    nodeIdRef.current = nodeId;
    // Seed with this render's name so a newly opened doc isn't treated as a rename.
    prevDocumentNameRef.current = documentName;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when switching documents
  }, [nodeId]);

  // Status bar describes this essay only (inbox/pop-out opens won't clobber it).
  useEffect(() => {
    setSyncFocus(nodeId);
    return () => {
      setSyncFocus(null);
    };
  }, [nodeId]);

  // Browser tab names the essay being edited.
  useEffect(() => {
    const title = essayTitle.trim();
    document.title =
      title && title !== "Untitled"
        ? `${title} · BlogIDE Editor`
        : "BlogIDE Editor";
    return () => {
      document.title = "BlogIDE";
    };
  }, [essayTitle]);

  const restoreDeletedFootnote = useCallback((id: string) => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.chain().focus("end").restoreDeletedFootnote(id).run();
  }, []);

  const dismissDeletedFootnote = useCallback((id: string) => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.commands.dismissDeletedFootnote(id);
  }, []);

  useEffect(() => {
    registerDeletedActions({
      restore: restoreDeletedFootnote,
      dismiss: dismissDeletedFootnote,
    });
  }, [
    registerDeletedActions,
    restoreDeletedFootnote,
    dismissDeletedFootnote,
  ]);

  useEffect(() => {
    if (isMarkdownCanonical(mode)) onDeletedFootnotesChange([]);
  }, [mode, onDeletedFootnotesChange]);

  /**
   * Write any debounced-but-unsaved draft to IndexedDB right now. Called on
   * blur / hide / doc switch so a fast tab close can't drop the last ~1s of
   * typing that was still sitting in the autosave timer.
   */
  const commitPendingLocal = useCallback((): Promise<void> => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    const pending = pendingLocalRef.current;
    if (!pending) return Promise.resolve();
    pendingLocalRef.current = null;
    lastPersistedRef.current = pending.markdown;
    return saveLocal(pending.nodeId, pending.markdown, baseVersionRef.current);
  }, []);

  // Load document when node changes.
  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!persistEnabled || !nodeId) {
        const unpacked = unpackDocument(SAMPLE_DOC);
        setDoc({
          frontmatter: unpacked.frontmatter,
          subtitle: unpacked.subtitle,
          author: unpacked.author,
          publication: unpacked.publication,
          body: unpacked.body,
        });
        setBaseVersion(1);
        setLoadError(null);
        return;
      }

      setLoading(true);
      setLoadError(null);
      try {
        // Flush previous doc before switching.
        await flushSyncQueue();
        const opened = await openDocument(nodeId);
        if (cancelled) return;
        pendingLocalRef.current = null;
        lastPersistedRef.current = opened.markdown;
        const unpacked = unpackDocument(
          opened.markdown,
          documentNameRef.current
        );
        setDoc({
          frontmatter: unpacked.frontmatter,
          subtitle: unpacked.subtitle,
          author: unpacked.author,
          publication: unpacked.publication,
          body: unpacked.body,
        });
        setBaseVersion(opened.baseVersion);
        const packed = packDocument(
          unpacked.frontmatter,
          unpacked.subtitle,
          unpacked.author,
          unpacked.publication,
          unpacked.body
        );
        // Keep the source view showing THIS document. Without this, switching
        // essays while in markdown mode left the previous essay's text in the
        // textarea, and a keystroke would save it over the new document.
        if (isMarkdownCanonical(modeRef.current)) {
          setSourceText(packed);
        }
        if (unpacked.changed) {
          // Persist migration of legacy `# Title` out of the body.
          persistMarkdownRef.current(packed);
        }
        onDocumentLoaded?.(packed);
        if (opened.dirty) {
          void syncDocument(nodeId).then(() => onRequestTreeRefresh?.());
        }
      } catch (error) {
        if (cancelled) return;
        setLoadError(
          error instanceof Error ? error.message : "Could not open document."
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
      if (syncTimer.current) clearTimeout(syncTimer.current);
      // Persist any draft still sitting in the autosave debounce before the
      // editor for this doc goes away (doc switch / unmount).
      const pending = pendingLocalRef.current;
      void commitPendingLocal().then(() => {
        if (pending) void syncDocument(pending.nodeId);
      });
    };
  }, [
    nodeId,
    persistEnabled,
    onDocumentLoaded,
    onRequestTreeRefresh,
    commitPendingLocal,
  ]);

  const syncFilenameFromTitle = useCallback(
    async (fullMarkdown: string) => {
      if (
        !persistEnabled ||
        !nodeId ||
        !canRenameDocument ||
        conflict?.unresolved ||
        !onRenameRef.current ||
        syncingNameRef.current
      ) {
        return;
      }
      const title = parseTitle(splitFrontmatter(fullMarkdown).frontmatter);
      if (!title || !documentName) return;
      if (fileNameMatchesTitle(documentName, title)) return;
      const desired = titleToFileName(title);
      syncingNameRef.current = true;
      try {
        const finalName = await onRenameRef.current(nodeId, desired);
        prevDocumentNameRef.current = finalName || desired;
      } finally {
        syncingNameRef.current = false;
      }
    },
    [
      persistEnabled,
      nodeId,
      canRenameDocument,
      conflict?.unresolved,
      documentName,
    ]
  );

  const persistMarkdown = useCallback(
    (fullMarkdown: string) => {
      if (!persistEnabled || !nodeId) return;
      if (fullMarkdown === lastPersistedRef.current) return;
      pendingLocalRef.current = { nodeId, markdown: fullMarkdown };
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        saveTimer.current = null;
        const pending = pendingLocalRef.current;
        if (!pending || pending.nodeId !== nodeId) return;
        pendingLocalRef.current = null;
        lastPersistedRef.current = pending.markdown;
        void saveLocal(pending.nodeId, pending.markdown, baseVersionRef.current).then(
          () => {
            void syncFilenameFromTitle(pending.markdown);
            if (syncTimer.current) clearTimeout(syncTimer.current);
            syncTimer.current = setTimeout(() => {
              void syncDocument(nodeId).then(async () => {
                const local = await getLocalDoc(nodeId);
                if (local && nodeIdRef.current === nodeId) {
                  setBaseVersion(local.baseVersion);
                }
                onRequestTreeRefresh?.();
              });
            }, 1500);
          }
        );
      }, 1000);
    },
    [
      persistEnabled,
      nodeId,
      onRequestTreeRefresh,
      syncFilenameFromTitle,
      setBaseVersion,
    ]
  );

  useEffect(() => {
    persistMarkdownRef.current = persistMarkdown;
  }, [persistMarkdown]);

  const getMarkdownForAi = useCallback(() => {
    flushMarkdownRef.current?.();
    if (isMarkdownCanonical(mode)) return sourceText || null;
    const editor = editorRef.current;
    const nextBody = editor ? serializeBody(editor.getJSON()) : body;
    return packDocument(
      frontmatter,
      subtitle,
      author,
      publication,
      nextBody
    );
  }, [mode, sourceText, frontmatter, subtitle, author, publication, body]);

  const applyMarkdown = useCallback(
    (markdown: string) => {
      const unpacked = unpackDocument(markdown, documentName);
      const packed = packDocument(
        unpacked.frontmatter,
        unpacked.subtitle,
        unpacked.author,
        unpacked.publication,
        unpacked.body
      );
      setDoc({
        frontmatter: unpacked.frontmatter,
        subtitle: unpacked.subtitle,
        author: unpacked.author,
        publication: unpacked.publication,
        body: unpacked.body,
      });
      if (isMarkdownCanonical(mode)) setSourceText(packed);
      persistMarkdownRef.current(packed);
    },
    [documentName, mode]
  );

  useEffect(() => {
    registerGetMarkdownForAi?.(getMarkdownForAi);
  }, [registerGetMarkdownForAi, getMarkdownForAi]);

  useEffect(() => {
    registerApplyMarkdown?.(applyMarkdown);
  }, [registerApplyMarkdown, applyMarkdown]);

  useEffect(() => {
    registerFlushDocument?.(() => {
      flushMarkdownRef.current?.();
      return commitPendingLocal();
    });
  }, [registerFlushDocument, commitPendingLocal]);

  const getSelectionForAi = useCallback((): AiSelection | null => {
    if (isMarkdownCanonical(mode)) {
      const el = sourceTextareaRef.current;
      if (!el) return null;
      return getSourceSelection(
        sourceText,
        el.selectionStart,
        el.selectionEnd
      );
    }
    const editor = editorRef.current;
    if (!editor) return null;
    return getWysiwygSelection(editor);
  }, [mode, sourceText]);

  const applySelectionForAi = useCallback(
    (markdown: string, selection: AiSelection): boolean => {
      if (selection.mode === "wysiwyg" && !isMarkdownCanonical(mode)) {
        const editor = editorRef.current;
        if (!editor) return false;
        const live = getWysiwygSelection(editor);
        if (live && live.text === selection.text) {
          return replaceWysiwygRange(editor, live.from, live.to, markdown);
        }
        if (selection.from >= 0 && selection.to >= selection.from) {
          return replaceWysiwygRange(
            editor,
            selection.from,
            selection.to,
            markdown
          );
        }
        return false;
      }

      const full = isMarkdownCanonical(mode)
        ? sourceText
        : packDocument(frontmatter, subtitle, author, publication, body);

      let from = selection.from;
      let to = selection.to;
      if (
        from < 0 ||
        to < from ||
        full.slice(from, to) !== selection.text
      ) {
        const index = full.indexOf(selection.text);
        if (index === -1) return false;
        from = index;
        to = index + selection.text.length;
      }
      const next = replaceSourceRange(full, from, to, markdown);
      if (next == null) return false;
      applyMarkdown(next);
      return true;
    },
    [
      mode,
      sourceText,
      frontmatter,
      subtitle,
      author,
      publication,
      body,
      applyMarkdown,
    ]
  );

  useEffect(() => {
    registerGetSelectionForAi?.(getSelectionForAi);
  }, [registerGetSelectionForAi, getSelectionForAi]);

  useEffect(() => {
    registerApplySelectionForAi?.(applySelectionForAi);
  }, [registerApplySelectionForAi, applySelectionForAi]);

  const convertFootnoteLinks = useCallback(async () => {
    const full = isMarkdownCanonical(mode)
      ? sourceText
      : packDocument(frontmatter, subtitle, author, publication, body);
    const { markdown, converted } = convertMarkdownFootnoteLinks(full);
    if (converted > 0) {
      applyMarkdown(markdown);
      return;
    }

    const keys = loadAiKeys();
    const provider = getActiveProvider(keys);
    if (keys.importAssist && provider) {
      const ok = await dialog.confirm({
        title: "AI import assist?",
        message:
          "No simple footnote links were found. Run AI cleanup for footnotes, headings, and quote-like indentation?",
        confirmLabel: "Clean with AI",
      });
      if (!ok) return;
      try {
        const reply = await chatCompletion({
          messages: [
            {
              role: "user",
              content: `Clean up this pasted essay for BlogIDE:\n\n${full}`,
            },
          ],
          system: IMPORT_CLEANUP_SYSTEM,
          provider,
        });
        applyMarkdown(unwrapMarkdownReply(reply.trim()));
      } catch (error) {
        await dialog.confirm({
          title: "AI cleanup failed",
          message:
            error instanceof Error ? error.message : "Could not clean import.",
          confirmLabel: "OK",
          cancelLabel: "Dismiss",
        });
      }
      return;
    }

    await dialog.confirm({
      title: "Nothing to convert",
      message:
        "No Substack-style footnote links or split note blocks matched. Re-paste from Substack, or enable AI import assist in Settings.",
      confirmLabel: "OK",
      cancelLabel: "Close",
    });
  }, [
    mode,
    sourceText,
    frontmatter,
    subtitle,
    author,
    publication,
    body,
    applyMarkdown,
    dialog,
  ]);

  // External rename (Files panel) → update frontmatter title.
  // Queue the write so we don't setState synchronously inside the effect body.
  // Skip while loading: otherwise a new doc can briefly inherit the previous body
  // and autosave it under the new node id (looks like "New document" cloned the open essay).
  // Skip when the new file name is only the sanitized/uniquified form of the
  // current title (title-driven rename) so "Document: 1" is not stomped to
  // "Document 1".
  useEffect(() => {
    if (
      loading ||
      !documentName ||
      syncingNameRef.current ||
      conflict?.unresolved
    ) {
      return;
    }
    if (prevDocumentNameRef.current === documentName) return;
    prevDocumentNameRef.current = documentName;
    const fromFile = fileNameToTitle(documentName);
    const timer = window.setTimeout(() => {
      if (loading) return;
      setDoc((prev) => {
        const current = parseTitle(prev.frontmatter);
        if (current === fromFile) return prev;
        if (current && fileNameMatchesTitle(documentName, current)) {
          return prev;
        }
        const nextFrontmatter = writeTitle(prev.frontmatter, fromFile);
        const next = {
          frontmatter: nextFrontmatter,
          subtitle: prev.subtitle,
          author: prev.author,
          publication: prev.publication,
          body: prev.body,
        };
        persistMarkdownRef.current(
          packDocument(
            next.frontmatter,
            next.subtitle,
            next.author,
            next.publication,
            next.body
          )
        );
        return next;
      });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [documentName, loading, conflict?.unresolved]);

  const setDocumentLanguages = useCallback((languages: string[]) => {
    setDoc((current) => {
      const nextFrontmatter = writeSpellcheckLangs(
        current.frontmatter,
        languages
      );
      const next = {
        frontmatter: nextFrontmatter,
        subtitle: current.subtitle,
        author: current.author,
        publication: current.publication,
        body: current.body,
      };
      persistMarkdownRef.current(
        packDocument(
          next.frontmatter,
          next.subtitle,
          next.author,
          next.publication,
          next.body
        )
      );
      return next;
    });
  }, []);

  const setSpellcheckOverride = useCallback((override: SpellcheckOverride) => {
    setDoc((current) => {
      const nextFrontmatter = writeSpellcheckOverride(
        current.frontmatter,
        override
      );
      const next = {
        frontmatter: nextFrontmatter,
        subtitle: current.subtitle,
        author: current.author,
        publication: current.publication,
        body: current.body,
      };
      persistMarkdownRef.current(
        packDocument(
          next.frontmatter,
          next.subtitle,
          next.author,
          next.publication,
          next.body
        )
      );
      return next;
    });
  }, []);

  const setEssayTitle = useCallback(
    (title: string) => {
      const cleaned = title.trim() || "Untitled";
      const current = docRef.current;
      const nextFrontmatter = writeTitle(current.frontmatter, cleaned);
      const next = {
        frontmatter: nextFrontmatter,
        subtitle: current.subtitle,
        author: current.author,
        publication: current.publication,
        body: current.body,
      };
      const packed = packDocument(
        next.frontmatter,
        next.subtitle,
        next.author,
        next.publication,
        next.body
      );
      setDoc(next);
      docRef.current = next;
      if (nodeId) onExplorerTitleChange?.(nodeId, cleaned);

      if (!persistEnabled || !nodeId) return;

      // Flush the title into IndexedDB before rename→refreshTree so
      // loadDocumentTitles cannot re-paint the previous frontmatter title over
      // the new filename (and so a newly opened tab sees the updated label).
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        saveTimer.current = null;
      }
      pendingLocalRef.current = null;
      lastPersistedRef.current = packed;

      void (async () => {
        await saveLocal(nodeId, packed, baseVersionRef.current);

        if (
          canRenameDocument &&
          !conflict?.unresolved &&
          onRenameRef.current &&
          documentNameRef.current &&
          !fileNameMatchesTitle(documentNameRef.current, cleaned)
        ) {
          const desired = titleToFileName(cleaned);
          syncingNameRef.current = true;
          try {
            const finalName = await onRenameRef.current(nodeId, desired);
            prevDocumentNameRef.current = finalName || desired;
          } finally {
            syncingNameRef.current = false;
          }
        }

        if (syncTimer.current) clearTimeout(syncTimer.current);
        syncTimer.current = setTimeout(() => {
          void syncDocument(nodeId).then(async () => {
            const local = await getLocalDoc(nodeId);
            if (local && nodeIdRef.current === nodeId) {
              setBaseVersion(local.baseVersion);
            }
            onRequestTreeRefresh?.();
          });
        }, 1500);
      })();
    },
    [
      persistEnabled,
      nodeId,
      canRenameDocument,
      conflict?.unresolved,
      onExplorerTitleChange,
      onRequestTreeRefresh,
      setBaseVersion,
    ]
  );

  const commitSubtitle = useCallback((next: string) => {
    setDoc((current) => {
      if (current.subtitle === next) return current;
      const nextFrontmatter = writeSubtitle(current.frontmatter, next);
      const updated = {
        frontmatter: nextFrontmatter,
        subtitle: next,
        author: current.author,
        publication: current.publication,
        body: current.body,
      };
      persistMarkdownRef.current(
        packDocument(
          updated.frontmatter,
          updated.subtitle,
          updated.author,
          updated.publication,
          updated.body
        )
      );
      return updated;
    });
  }, []);

  const commitFrontmatter = useCallback((nextFrontmatter: string) => {
    setDoc((current) => {
      if (current.frontmatter === nextFrontmatter) return current;
      const updated = {
        frontmatter: nextFrontmatter,
        subtitle: parseSubtitle(nextFrontmatter),
        author: parseAuthor(nextFrontmatter),
        publication: parsePublication(nextFrontmatter),
        body: current.body,
      };
      persistMarkdownRef.current(
        packDocument(
          updated.frontmatter,
          updated.subtitle,
          updated.author,
          updated.publication,
          updated.body
        )
      );
      return updated;
    });
  }, []);

  const conflictNotice = conflict ? (
    <div
      role={conflict.unresolved ? "status" : undefined}
      className={`mb-3 flex flex-wrap items-center gap-2 rounded border px-3 py-2 text-xs ${
        conflict.badge === "Conflict"
          ? "border-amber-500/50 bg-amber-500/10"
          : "border-border bg-panel/70"
      }`}
      title={`${documentName ?? "Document"} · ${formatConflictTimestamp(
        conflict.createdAt
      )}`}
    >
      <strong>
        {conflict.badge === "Conflict" ? "Conflict copy" : "Local copy"}
      </strong>
      <span className="text-muted">
        {formatConflictTimestamp(conflict.createdAt)}
      </span>
      {conflict.resolvable && onReviewConflict && (
        <button
          type="button"
          className="ml-auto rounded border border-border bg-background px-2 py-0.5 font-medium hover:border-accent hover:text-accent"
          onClick={onReviewConflict}
        >
          Review
        </button>
      )}
    </div>
  ) : null;

  const titleField = (
    <>
      {conflictNotice}
      <EssayTitleBlock
        title={essayTitle}
        subtitle={subtitle}
        frontmatter={frontmatter}
        onTitleCommit={setEssayTitle}
        onSubtitleCommit={commitSubtitle}
        onFrontmatterChange={commitFrontmatter}
        onFocusBody={() => {
          editorRef.current?.commands.focus("start");
        }}
        titleDisabled={!canRenameDocument && Boolean(nodeId) && !previewMode}
      />
    </>
  );

  /** Load fresh markdown into editor state (fast-forward / restore). */
  const applyOpenedMarkdown = useCallback(
    (markdown: string, version: number) => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        saveTimer.current = null;
      }
      if (syncTimer.current) {
        clearTimeout(syncTimer.current);
        syncTimer.current = null;
      }
      pendingLocalRef.current = null;
      lastPersistedRef.current = markdown;
      baseVersionRef.current = version;
      const unpacked = unpackDocument(markdown, documentNameRef.current);
      setDoc({
        frontmatter: unpacked.frontmatter,
        subtitle: unpacked.subtitle,
        author: unpacked.author,
        publication: unpacked.publication,
        body: unpacked.body,
      });
      setBaseVersion(version);
      if (isMarkdownCanonical(modeRef.current)) {
        setSourceText(
          packDocument(
            unpacked.frontmatter,
            unpacked.subtitle,
            unpacked.author,
            unpacked.publication,
            unpacked.body
          )
        );
      }
    },
    [setBaseVersion]
  );

  // After a conflict resolution, clear stale debounces and reload the
  // canonical remote once per conflict copy (not on every later status emit).
  const handledConflictRef = useRef<string | null>(null);
  useEffect(() => {
    handledConflictRef.current = null;
  }, [nodeId]);
  useEffect(() => {
    if (!persistEnabled || !nodeId) return;
    return subscribeSyncStatus((status) => {
      if (!status.conflictCopyId || !status.message) return;
      if (handledConflictRef.current === status.conflictCopyId) return;
      handledConflictRef.current = status.conflictCopyId;
      void openDocument(nodeId).then((opened) => {
        if (nodeIdRef.current !== nodeId) return;
        applyOpenedMarkdown(opened.markdown, opened.baseVersion);
      });
    });
  }, [persistEnabled, nodeId, applyOpenedMarkdown]);

  // A sibling tab may resolve the same shared IndexedDB draft first. Reload
  // when our pending text is already preserved; keep genuinely different
  // typing dirty so it receives its own conflict review.
  useEffect(() => {
    if (!persistEnabled || !nodeId) return;
    return subscribeCrossTabConflict((event) => {
      if (event.originId !== nodeId || nodeIdRef.current !== nodeId) return;
      const pending = pendingLocalRef.current;
      if (
        pending &&
        normalize(pending.markdown) !== normalize(event.localMarkdown)
      ) {
        void commitPendingLocal().then(() => syncDocument(nodeId));
        return;
      }
      applyOpenedMarkdown(event.remoteMarkdown, event.remoteVersion);
    });
  }, [
    persistEnabled,
    nodeId,
    applyOpenedMarkdown,
    commitPendingLocal,
  ]);

  // On tab wake: if this doc is clean locally but remote advanced (edited on
  // another device while the tab slept), silently fast-forward the editor
  // instead of waiting for the next keystroke to manufacture a conflict copy.
  useEffect(() => {
    if (!persistEnabled || !nodeId) return;
    const docId = nodeId;
    let timer: number | null = null;

    function scheduleFastForward() {
      if (document.visibilityState !== "visible") return;
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        timer = null;
        // Never clobber typing that is still debouncing toward IndexedDB.
        if (pendingLocalRef.current || saveTimer.current) return;
        void fastForwardDocument(docId).then((updated) => {
          if (!updated || nodeIdRef.current !== docId) return;
          if (pendingLocalRef.current || saveTimer.current) return;
          applyOpenedMarkdown(updated.markdown, updated.baseVersion);
        });
      }, 200);
    }

    document.addEventListener("visibilitychange", scheduleFastForward);
    window.addEventListener("focus", scheduleFastForward);
    return () => {
      if (timer) window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", scheduleFastForward);
      window.removeEventListener("focus", scheduleFastForward);
    };
  }, [persistEnabled, nodeId, applyOpenedMarkdown]);

  /**
   * Restore an older snapshot. Outstanding edits are flushed and pushed
   * first, so the pre-restore state is itself snapshotted server-side.
   */
  const restoreRevision = useCallback(
    async (version: number) => {
      if (!persistEnabled || !nodeId) throw new Error("Not connected.");
      flushMarkdownRef.current?.();
      await commitPendingLocal();
      await syncDocument(nodeId);
      const result = await restoreDocumentRevision(nodeId, version);
      if (!result.ok) {
        throw new Error(
          result.reason === "quota"
            ? "Restore blocked: storage quota exceeded."
            : `Could not restore this version (${result.reason}).`
        );
      }
      const opened = await openDocument(nodeId);
      if (nodeIdRef.current !== nodeId) return;
      applyOpenedMarkdown(opened.markdown, opened.baseVersion);
      onRequestTreeRefresh?.();
    },
    [
      persistEnabled,
      nodeId,
      commitPendingLocal,
      applyOpenedMarkdown,
      onRequestTreeRefresh,
    ]
  );

  // Flush on blur / hide / offline reconnect.
  useEffect(() => {
    if (!persistEnabled || !nodeId) return;

    function flush() {
      // Serialize any keystrokes still in the editor's emit debounce, then
      // commit the pending local draft before pushing the queue. Ordering
      // matters: on pagehide the IDB write is what actually protects data.
      flushMarkdownRef.current?.();
      void commitPendingLocal()
        .then(() => flushSyncQueue())
        .then(() => onRequestTreeRefresh?.());
    }

    function onVisibility() {
      if (document.visibilityState === "hidden") flush();
    }

    window.addEventListener("blur", flush);
    window.addEventListener("pagehide", flush);
    window.addEventListener("online", flush);
    document.addEventListener("visibilitychange", onVisibility);
    const interval = window.setInterval(flush, 60_000);

    return () => {
      window.removeEventListener("blur", flush);
      window.removeEventListener("pagehide", flush);
      window.removeEventListener("online", flush);
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearInterval(interval);
    };
  }, [persistEnabled, nodeId, onRequestTreeRefresh, commitPendingLocal]);

  function collapseRailsForMarkdown() {
    if (railsSnapshot) return;
    setRailsSnapshot({
      outlineOpen,
      sidenotes: prefs.sidenotes,
    });
    setOutlineOpen(false);
    if (prefs.sidenotes) updatePrefs({ sidenotes: false });
  }

  function restoreRailsFromMarkdown() {
    if (!railsSnapshot) return;
    setOutlineOpen(railsSnapshot.outlineOpen);
    updatePrefs({ sidenotes: railsSnapshot.sidenotes });
    setRailsSnapshot(null);
  }

  /** Flush WYSIWYG → packed markdown buffer (shared by split / source). */
  function flushEditorIntoSourceBuffer() {
    flushMarkdownRef.current?.();
    const editor = editorRef.current;
    const nextBody = editor ? serializeBody(editor.getJSON()) : body;
    const packed = packDocument(
      frontmatter,
      subtitle,
      author,
      publication,
      nextBody
    );
    if (nextBody !== body) {
      setDoc((current) => ({
        frontmatter: current.frontmatter,
        subtitle: current.subtitle,
        author: current.author,
        publication: current.publication,
        body: nextBody,
      }));
    }
    setSourceText(packed);
    return packed;
  }

  function toSplit() {
    if (mode === "wysiwyg") flushEditorIntoSourceBuffer();
    collapseRailsForMarkdown();
    setLossyDiffOpen(false);
    setMode("split");
  }

  function toSource() {
    if (mode === "wysiwyg") flushEditorIntoSourceBuffer();
    collapseRailsForMarkdown();
    setLossyDiffOpen(false);
    setMode("source");
  }

  /** Apply markdown buffer into WYSIWYG — no blocking lossy gate. */
  function toWysiwyg() {
    setLossyDiffOpen(false);
    const unpacked = unpackDocument(sourceText, documentName);
    setDoc({
      frontmatter: unpacked.frontmatter,
      subtitle: unpacked.subtitle,
      author: unpacked.author,
      publication: unpacked.publication,
      body: unpacked.body,
    });
    restoreRailsFromMarkdown();
    setMode("wysiwyg");
    persistMarkdown(
      packDocument(
        unpacked.frontmatter,
        unpacked.subtitle,
        unpacked.author,
        unpacked.publication,
        unpacked.body
      )
    );
  }

  const sourceLossy = isMarkdownCanonical(mode) && isLossy(sourceText);
  const lossyDiffLines = sourceLossy
    ? compactDiff(
        unifiedLineDiff(sourceText, previewRoundTrip(sourceText)),
        2
      )
    : [];

  function currentMarkdown(): string {
    flushMarkdownRef.current?.();
    const editor = editorRef.current;
    const nextBody = editor ? serializeBody(editor.getJSON()) : body;
    return isMarkdownCanonical(mode)
      ? sourceText
      : packDocument(frontmatter, subtitle, author, publication, nextBody);
  }

  async function exportMarkdownFile() {
    downloadMarkdown(
      currentMarkdown(),
      documentName ?? `${essayTitle}.md`
    );
  }

  async function copyForExport() {
    try {
      await copyMarkdownToClipboard(currentMarkdown());
    } catch {
      await dialog.confirm({
        title: "Copy failed",
        message:
          "Could not write to the clipboard. Try downloading .md instead.",
        confirmLabel: "OK",
        cancelLabel: "Close",
      });
    }
  }

  async function copyForPublish(target: PublishCopyTarget) {
    const markdown = currentMarkdown();
    const { html } = htmlForPublishTarget(markdown, target);
    try {
      await copyDocumentForPaste({ markdown, html });
    } catch {
      await dialog.confirm({
        title: "Copy failed",
        message:
          "Could not write to the clipboard. Try downloading .md instead.",
        confirmLabel: "OK",
        cancelLabel: "Close",
      });
    }
  }

  async function exportDocx() {
    try {
      await exportMarkdownAsDocx(currentMarkdown(), essayTitle);
    } catch (error) {
      await dialog.confirm({
        title: "Word export failed",
        message:
          error instanceof Error
            ? error.message
            : "Could not convert this essay to Word.",
        confirmLabel: "OK",
        cancelLabel: "Close",
      });
    }
  }

  async function pushCurrentToGithub() {
    if (!nodeId) return;
    flushMarkdownRef.current?.();
    await commitPendingLocal();
    try {
      const results = await pushWorkspaceToGithubWithStatus({
        scope: { nodeId },
      });
      const files = results.reduce((n, r) => n + r.fileCount, 0);
      await dialog.confirm({
        title: "Pushed to GitHub",
        message: `Wrote ${files} file${files === 1 ? "" : "s"}. Matching paths were overwritten; extra files in the repo were left alone.`,
        confirmLabel: "OK",
        cancelLabel: "Close",
      });
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

  function openCleanup(tab: CleanupTab = "import") {
    setCleanupEditor(mode === "wysiwyg" ? editorRef.current : null);
    setCleanupTab(tab);
    setCleanupOpen(true);
  }

  function viewRawMarkdown() {
    // Full-pane source only when the Editor setting allows it (and on narrow
    // viewports). Otherwise always open split.
    if (prefs.allowMarkdownOnly && preferMarkdownOnlyPane()) toSource();
    else toSplit();
  }

  const showMarkdownOnly = prefs.allowMarkdownOnly;

  const overflowItems: OverflowItem[] = [
    // View
    ...(mode === "wysiwyg"
      ? [
          {
            id: "mode-raw",
            label: "View raw markdown",
            onSelect: () => viewRawMarkdown(),
          },
          ...(showMarkdownOnly && !preferMarkdownOnlyPane()
            ? [
                {
                  id: "mode-md-only",
                  label: "Markdown only",
                  onSelect: () => toSource(),
                },
              ]
            : []),
        ]
      : [
          {
            id: "mode-rich",
            label: "Rich text editor",
            onSelect: () => toWysiwyg(),
          },
        ]),
    ...(mode === "split" && showMarkdownOnly
      ? [
          {
            id: "mode-md-only",
            label: "Markdown only",
            onSelect: () => toSource(),
          },
        ]
      : []),
    ...(mode === "source"
      ? [
          {
            id: "mode-split",
            label: "Split view",
            onSelect: () => toSplit(),
          },
        ]
      : []),
    {
      id: "preview",
      label: "Preview in new tab",
      onSelect: () => {
        try {
          openPublicationPreviewTab(currentMarkdown());
        } catch (err) {
          void dialog.confirm({
            title: "Preview blocked",
            message:
              err instanceof Error
                ? err.message
                : "Could not open the preview tab.",
            confirmLabel: "OK",
            cancelLabel: "Close",
          });
        }
      },
    },
    { kind: "separator", id: "sep-export" },
    {
      kind: "submenu",
      id: "copy",
      label: "Copy",
      items: [
        {
          id: "copy-all",
          label: "All text",
          onSelect: () => {
            void copyForExport();
          },
        },
        ...PUBLISH_COPY_TARGETS.map((target) => ({
          id: `copy-for-${target.id}`,
          label: `For ${target.label}`,
          onSelect: () => {
            void copyForPublish(target.id);
          },
        })),
      ],
    },
    {
      kind: "submenu",
      id: "export",
      label: "Export",
      items: [
        {
          id: "export-md",
          label: "Markdown",
          onSelect: () => {
            void exportMarkdownFile();
          },
        },
        {
          id: "export-docx",
          label: "Word (.docx)",
          onSelect: () => {
            void exportDocx();
          },
        },
      ],
    },
    ...(persistEnabled && nodeId
      ? [
          {
            id: "push-github",
            label: "Push to GitHub",
            onSelect: () => {
              void pushCurrentToGithub();
            },
          },
        ]
      : []),
    { kind: "separator", id: "sep-settings" },
    ...(persistEnabled && nodeId
      ? [
          {
            id: "history",
            label: "Version history",
            onSelect: () => setHistoryOpen(true),
          },
        ]
      : []),
    {
      id: "essay-settings",
      label: "Essay settings",
      onSelect: () => setEssaySettingsOpen(true),
    },
  ];

  function toggleMarkdownView() {
    if (isMarkdownCanonical(mode)) toWysiwyg();
    else viewRawMarkdown();
  }

  const toggleMarkdownViewRef = useRef(toggleMarkdownView);
  useEffect(() => {
    toggleMarkdownViewRef.current = toggleMarkdownView;
  });

  // Ctrl/Cmd+\ toggles raw markdown (split) ↔ rich text from any mode.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) {
        return;
      }
      if (event.key !== "\\" && event.code !== "Backslash") return;
      event.preventDefault();
      toggleMarkdownViewRef.current();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const toolbarActions = (
    <>
      {conflict &&
        (conflict.resolvable && onReviewConflict ? (
          <button
            type="button"
            onClick={onReviewConflict}
            className="blogide-chrome-btn border-amber-500/50 text-amber-700 dark:text-amber-300"
            title="Compare the cloud and local conflict versions"
          >
            Review conflict
          </button>
        ) : (
          <span
            className="rounded border border-amber-500/50 bg-amber-500/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300"
            title={`${documentName ?? "Document"} · ${formatConflictTimestamp(
              conflict.createdAt
            )}`}
          >
            {conflict.badge === "Conflict" ? "Conflict copy" : "Local copy"}
          </span>
        ))}
      {isMarkdownCanonical(mode) && (
        <button
          type="button"
          onClick={() => toWysiwyg()}
          className="blogide-chrome-btn"
          title="Return to rich text editor (Ctrl+\\)"
        >
          Rich text
        </button>
      )}
      {nodeId && !previewMode && (
        <button
          type="button"
          onClick={() => {
            flushMarkdownRef.current?.();
            openPopOut(nodeId, essayTitle);
          }}
          className="blogide-chrome-btn"
          title="Pop out this essay in a floating window"
        >
          Pop out
        </button>
      )}
      <EditorOverflowMenu items={overflowItems} />
    </>
  );

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted">
        Opening document…
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-sm text-red-600 dark:text-red-400">
        {loadError}
      </div>
    );
  }

  if (!nodeId && !previewMode && isSupabaseConfigured()) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted">
        Select a document from the Files panel.
      </div>
    );
  }

  const markdownChrome = (
    <>
      <EssaySettingsPanel
        open={essaySettingsOpen}
        onClose={() => setEssaySettingsOpen(false)}
        title={essayTitle}
        onTitleChange={setEssayTitle}
        documentLanguages={documentLanguages}
        onDocumentLanguagesChange={setDocumentLanguages}
        spellcheckOverride={spellcheckOverride}
        onSpellcheckOverrideChange={setSpellcheckOverride}
        canEditTitle={canRenameDocument}
      />
      <VersionHistoryPanel
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        nodeId={nodeId}
        onRestore={restoreRevision}
        getCurrentMarkdown={currentMarkdown}
      />
      <CleanupDialog
        open={cleanupOpen}
        onClose={() => setCleanupOpen(false)}
        editor={cleanupEditor}
        initialTab={cleanupTab}
        getMarkdown={currentMarkdown}
        onFixFootnotes={() => void convertFootnoteLinks()}
      />
    </>
  );

  if (mode === "split") {
    return (
      <>
        <MarkdownSplitView
          sourceText={sourceText}
          onSourceChange={(next) => {
            setSourceText(next);
            persistMarkdown(next);
          }}
          sourceTextareaRef={sourceTextareaRef}
          toolbarExtra={toolbarActions}
          shellDock={shellDock}
          spellcheckEnabled={false}
          spellcheckLang={spellcheckLang}
          documentName={documentName}
        />
        {markdownChrome}
      </>
    );
  }

  if (mode === "source") {
    return (
      <div className="flex h-full flex-col">
        <div className="flex shrink-0 items-center justify-between border-b border-border px-3 py-1.5">
          <span className="text-xs font-mono uppercase tracking-wider text-muted">
            Markdown source
          </span>
          <span className="flex items-center gap-1">{toolbarActions}</span>
        </div>

        {sourceLossy && (
          <div
            role="status"
            className="border-b border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm"
          >
            <div className="flex flex-wrap items-center gap-3">
              <span>
                Rich text will show a normalized form of this markdown.
              </span>
              <button
                type="button"
                onClick={() => setLossyDiffOpen((open) => !open)}
                className="rounded border border-border px-2.5 py-1 text-xs hover:bg-panel ml-auto"
              >
                {lossyDiffOpen ? "Hide normalization" : "Show normalization"}
              </button>
            </div>
            {lossyDiffOpen && (
              <pre className="lossy-diff mt-2 max-h-56 overflow-auto rounded border border-border bg-background p-2 font-mono text-[0.7rem] leading-snug">
                {lossyDiffLines.length === 0 ? (
                  <span className="text-muted">
                    No line-level changes detected.
                  </span>
                ) : (
                  lossyDiffLines.map((line, index) => (
                    <div
                      key={`${line.type}-${index}`}
                      className={
                        line.type === "add"
                          ? "lossy-diff-add"
                          : line.type === "remove"
                            ? "lossy-diff-remove"
                            : "text-muted"
                      }
                    >
                      {line.type === "add"
                        ? `+ ${line.text}`
                        : line.type === "remove"
                          ? `- ${line.text}`
                          : `  ${line.text}`}
                    </div>
                  ))
                )}
              </pre>
            )}
          </div>
        )}

        <textarea
          ref={sourceTextareaRef}
          value={sourceText}
          onChange={(e) => {
            setSourceText(e.target.value);
            persistMarkdown(e.target.value);
          }}
          spellCheck={false}
          lang={spellcheckLang}
          aria-label="Markdown source"
          className="min-h-0 w-full flex-1 resize-none bg-transparent px-6 py-6 font-mono text-sm leading-relaxed outline-none"
        />
        {shellDock}
        {markdownChrome}
      </div>
    );
  }

  return (
    <>
      <DocumentEditor
        key={`${nodeId ?? "preview"}-${prefs.markdownTypingShortcuts}`}
        markdown={body}
        onChange={(md) => {
          const current = docRef.current;
          // Persist synchronously (not inside the setDoc updater): the
          // pagehide flush relies on this running before the tab dies.
          persistMarkdownRef.current(
            packDocument(
              current.frontmatter,
              current.subtitle,
              current.author,
              current.publication,
              md
            )
          );
          setDoc((prev) => ({
            frontmatter: prev.frontmatter,
            subtitle: prev.subtitle,
            author: prev.author,
            publication: prev.publication,
            body: md,
          }));
        }}
        onDeletedFootnotesChange={onDeletedFootnotesChange}
        editorRef={editorRef}
        flushMarkdownRef={flushMarkdownRef}
        titleSlot={titleField}
        shellDock={shellDock}
        spellcheckEnabled={spellcheckEnabled}
        spellcheckLanguages={spellcheckLanguages}
        toolbarExtra={toolbarActions}
        cleanupOpen={cleanupOpen}
        onOpenCleanup={() => openCleanup("import")}
        outlineOpen={outlineOpen}
        onOutlineOpenChange={setOutlineOpen}
      />
      <EssaySettingsPanel
        open={essaySettingsOpen}
        onClose={() => setEssaySettingsOpen(false)}
        title={essayTitle}
        onTitleChange={setEssayTitle}
        documentLanguages={documentLanguages}
        onDocumentLanguagesChange={setDocumentLanguages}
        spellcheckOverride={spellcheckOverride}
        onSpellcheckOverrideChange={setSpellcheckOverride}
        canEditTitle={canRenameDocument}
      />
      <VersionHistoryPanel
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        nodeId={nodeId}
        onRestore={restoreRevision}
        getCurrentMarkdown={currentMarkdown}
      />
      <CleanupDialog
        open={cleanupOpen}
        onClose={() => setCleanupOpen(false)}
        editor={cleanupEditor}
        initialTab={cleanupTab}
        getMarkdown={currentMarkdown}
        onFixFootnotes={() => void convertFootnoteLinks()}
      />
    </>
  );
}
