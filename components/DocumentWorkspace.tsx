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
import { EditorOverflowMenu } from "@/components/EditorOverflowMenu";
import { useEditorPrefs } from "@/components/EditorPrefsContext";
import { openPublicationPreviewTab } from "@/lib/preview/publicationHtml";
import { splitFrontmatter } from "@/lib/markdown/frontmatter";
import { compactDiff, unifiedLineDiff } from "@/lib/markdown/diff";
import {
  isLossy,
  previewRoundTrip,
  serializeBody,
} from "@/lib/markdown/pipeline";
import type { DeletedFootnote } from "@/lib/markdown/deletedFootnotes";
import { getLocalDoc } from "@/lib/db/indexed";
import {
  flushSyncQueue,
  openDocument,
  saveLocal,
  setSyncFocus,
  subscribeSyncStatus,
  syncDocument,
} from "@/lib/sync/engine";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import {
  parseSpellcheckLangs,
  writeSpellcheckLangs,
} from "@/lib/markdown/spellcheckFrontmatter";
import {
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
import { EssaySettingsPanel } from "@/components/EssaySettingsPanel";
import { EssayTitleBlock } from "@/components/EssayTitleBlock";
import { convertMarkdownFootnoteLinks } from "@/lib/import/footnotePaste";
import { getActiveProvider, loadAiKeys } from "@/lib/ai/keys";
import { chatCompletion, IMPORT_CLEANUP_SYSTEM } from "@/lib/ai/client";
import { useAppDialog } from "@/components/AppDialog";
import {
  copyDocumentForPaste,
  downloadMarkdown,
} from "@/lib/export/document";
import { openPopOut } from "@/lib/pins/popOutStore";

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
  const changed =
    normalized.changed ||
    frontmatter !== normalized.frontmatter ||
    legacy.body !== normalized.body;
  return {
    frontmatter,
    subtitle,
    author,
    body: legacy.body,
    title: normalized.title,
    changed,
  };
}

function packDocument(
  frontmatter: string,
  subtitle: string,
  author: string,
  body: string
): string {
  return writeAuthor(writeSubtitle(frontmatter, subtitle), author) + body;
}

type Mode = "wysiwyg" | "source";

type Props = {
  nodeId: string | null;
  /** Current workspace file name for the open document (e.g. essay.md). */
  documentName?: string | null;
  /** When false, title edits won't rename the file (scratchpad). */
  canRenameDocument?: boolean;
  previewMode?: boolean;
  onDeletedFootnotesChange: (deleted: DeletedFootnote[]) => void;
  registerDeletedActions: (actions: {
    restore: (id: string) => void;
    dismiss: (id: string) => void;
  }) => void;
  onDocumentLoaded?: (markdown: string) => void;
  onRequestTreeRefresh?: () => void;
  onRenameDocument?: (nodeId: string, fileName: string) => Promise<void>;
  /** Pull current essay markdown when the AI sidebar sends / cleans. */
  registerGetMarkdownForAi?: (get: () => string | null) => void;
  registerApplyMarkdown?: (apply: (markdown: string) => void) => void;
  /** Docked under the prose column (between Outline and sidenotes). */
  shellDock?: ReactNode;
};

export function DocumentWorkspace({
  nodeId,
  documentName = null,
  canRenameDocument = true,
  previewMode = false,
  onDeletedFootnotesChange,
  registerDeletedActions,
  onDocumentLoaded,
  onRequestTreeRefresh,
  onRenameDocument,
  registerGetMarkdownForAi,
  registerApplyMarkdown,
  shellDock,
}: Props) {
  const dialog = useAppDialog();
  const [{ frontmatter, subtitle, author, body }, setDoc] = useState(() => {
    const unpacked = unpackDocument(SAMPLE_DOC);
    return {
      frontmatter: unpacked.frontmatter,
      subtitle: unpacked.subtitle,
      author: unpacked.author,
      body: unpacked.body,
    };
  });
  const documentNameRef = useRef(documentName);
  const [mode, setMode] = useState<Mode>("wysiwyg");
  const [sourceText, setSourceText] = useState("");
  const [lossyWarning, setLossyWarning] = useState(false);
  const [lossyDiffOpen, setLossyDiffOpen] = useState(false);
  const [essaySettingsOpen, setEssaySettingsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [baseVersion, setBaseVersion] = useState(1);
  const editorRef = useRef<Editor | null>(null);
  const flushMarkdownRef = useRef<(() => void) | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const baseVersionRef = useRef(1);
  const nodeIdRef = useRef(nodeId);
  const syncingNameRef = useRef(false);
  const prevDocumentNameRef = useRef<string | null | undefined>(documentName);
  const { prefs, updatePrefs } = useEditorPrefs();
  const persistEnabled = isSupabaseConfigured() && !previewMode && !!nodeId;
  const documentLanguages = parseSpellcheckLangs(frontmatter);
  const essayTitle =
    parseTitle(frontmatter) ??
    (documentName ? fileNameToTitle(documentName) : "Untitled");
  const persistMarkdownRef = useRef<(full: string) => void>(() => {});
  const onRenameRef = useRef(onRenameDocument);

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
    nodeIdRef.current = nodeId;
    // Seed with this render's name so a newly opened doc isn't treated as a rename.
    prevDocumentNameRef.current = documentName;
    // Clear immediately so the previous essay never paints / autosaves under the new id.
    setDoc({
      frontmatter: "---\ntitle: Untitled\nstatus: draft\n---\n",
      subtitle: "",
      author: "",
      body: "",
    });
    setLoading(Boolean(persistEnabled && nodeId));
    setLoadError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when switching documents
  }, [nodeId]);

  // Status bar describes this essay only (inbox/pop-out opens won't clobber it).
  useEffect(() => {
    setSyncFocus(nodeId);
    return () => {
      setSyncFocus(null);
    };
  }, [nodeId]);

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
    if (mode === "source") onDeletedFootnotesChange([]);
  }, [mode, onDeletedFootnotesChange]);

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
        const unpacked = unpackDocument(
          opened.markdown,
          documentNameRef.current
        );
        setDoc({
          frontmatter: unpacked.frontmatter,
          subtitle: unpacked.subtitle,
          author: unpacked.author,
          body: unpacked.body,
        });
        setBaseVersion(opened.baseVersion);
        const packed = packDocument(
          unpacked.frontmatter,
          unpacked.subtitle,
          unpacked.author,
          unpacked.body
        );
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
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (syncTimer.current) clearTimeout(syncTimer.current);
    };
  }, [nodeId, persistEnabled, onDocumentLoaded, onRequestTreeRefresh]);

  const syncFilenameFromTitle = useCallback(
    async (fullMarkdown: string) => {
      if (
        !persistEnabled ||
        !nodeId ||
        !canRenameDocument ||
        !onRenameRef.current ||
        syncingNameRef.current
      ) {
        return;
      }
      const title = parseTitle(splitFrontmatter(fullMarkdown).frontmatter);
      if (!title) return;
      const desired = titleToFileName(title);
      if (!documentName || desired === documentName) return;
      syncingNameRef.current = true;
      try {
        await onRenameRef.current(nodeId, desired);
      } finally {
        syncingNameRef.current = false;
      }
    },
    [persistEnabled, nodeId, canRenameDocument, documentName]
  );

  const persistMarkdown = useCallback(
    (fullMarkdown: string) => {
      if (!persistEnabled || !nodeId) return;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        const version = baseVersionRef.current;
        void saveLocal(nodeId, fullMarkdown, version).then(() => {
          void syncFilenameFromTitle(fullMarkdown);
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
        });
      }, 1000);
    },
    [
      persistEnabled,
      nodeId,
      onRequestTreeRefresh,
      syncFilenameFromTitle,
    ]
  );

  useEffect(() => {
    persistMarkdownRef.current = persistMarkdown;
  }, [persistMarkdown]);

  const getMarkdownForAi = useCallback(() => {
    flushMarkdownRef.current?.();
    if (mode === "source") return sourceText || null;
    const editor = editorRef.current;
    const nextBody = editor ? serializeBody(editor.getJSON()) : body;
    return packDocument(frontmatter, subtitle, author, nextBody);
  }, [mode, sourceText, frontmatter, subtitle, author, body]);

  const applyMarkdown = useCallback(
    (markdown: string) => {
      const unpacked = unpackDocument(markdown, documentName);
      const packed = packDocument(
        unpacked.frontmatter,
        unpacked.subtitle,
        unpacked.author,
        unpacked.body
      );
      setDoc({
        frontmatter: unpacked.frontmatter,
        subtitle: unpacked.subtitle,
        author: unpacked.author,
        body: unpacked.body,
      });
      if (mode === "source") setSourceText(packed);
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

  const convertFootnoteLinks = useCallback(async () => {
    const full =
      mode === "source"
        ? sourceText
        : packDocument(frontmatter, subtitle, author, body);
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
        applyMarkdown(reply.trim());
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
        "No Substack-style footnote links or split note blocks matched. Re-paste from Substack, or enable AI import assist in Account settings.",
      confirmLabel: "OK",
      cancelLabel: "Close",
    });
  }, [
    mode,
    sourceText,
    frontmatter,
    subtitle,
    author,
    body,
    applyMarkdown,
    dialog,
  ]);

  // External rename (Files panel) → update frontmatter title.
  // Queue the write so we don't setState synchronously inside the effect body.
  // Skip while loading: otherwise a new doc can briefly inherit the previous body
  // and autosave it under the new node id (looks like "New document" cloned the open essay).
  useEffect(() => {
    if (loading || !documentName || syncingNameRef.current) return;
    if (prevDocumentNameRef.current === documentName) return;
    prevDocumentNameRef.current = documentName;
    const fromFile = fileNameToTitle(documentName);
    const timer = window.setTimeout(() => {
      if (loading) return;
      setDoc((prev) => {
        const current = parseTitle(prev.frontmatter);
        if (current === fromFile) return prev;
        const nextFrontmatter = writeTitle(prev.frontmatter, fromFile);
        const next = {
          frontmatter: nextFrontmatter,
          subtitle: prev.subtitle,
          author: prev.author,
          body: prev.body,
        };
        persistMarkdownRef.current(
          packDocument(
            next.frontmatter,
            next.subtitle,
            next.author,
            next.body
          )
        );
        return next;
      });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [documentName, loading]);

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
        body: current.body,
      };
      persistMarkdownRef.current(
        packDocument(
          next.frontmatter,
          next.subtitle,
          next.author,
          next.body
        )
      );
      return next;
    });
  }, []);

  const setEssayTitle = useCallback(
    (title: string) => {
      const cleaned = title.trim() || "Untitled";
      setDoc((current) => {
        const nextFrontmatter = writeTitle(current.frontmatter, cleaned);
        const next = {
          frontmatter: nextFrontmatter,
          subtitle: current.subtitle,
          author: current.author,
          body: current.body,
        };
        persistMarkdownRef.current(
          packDocument(
            next.frontmatter,
            next.subtitle,
            next.author,
            next.body
          )
        );
        return next;
      });
      if (
        persistEnabled &&
        nodeId &&
        canRenameDocument &&
        onRenameRef.current
      ) {
        const desired = titleToFileName(cleaned);
        if (desired !== documentName) {
          syncingNameRef.current = true;
          void onRenameRef.current(nodeId, desired).finally(() => {
            syncingNameRef.current = false;
          });
        }
      }
    },
    [persistEnabled, nodeId, canRenameDocument, documentName]
  );

  const commitSubtitle = useCallback((next: string) => {
    setDoc((current) => {
      if (current.subtitle === next) return current;
      const nextFrontmatter = writeSubtitle(current.frontmatter, next);
      const updated = {
        frontmatter: nextFrontmatter,
        subtitle: next,
        author: current.author,
        body: current.body,
      };
      persistMarkdownRef.current(
        packDocument(
          updated.frontmatter,
          updated.subtitle,
          updated.author,
          updated.body
        )
      );
      return updated;
    });
  }, []);

  const commitAuthor = useCallback((next: string) => {
    setDoc((current) => {
      if (current.author === next) return current;
      const nextFrontmatter = writeAuthor(current.frontmatter, next);
      const updated = {
        frontmatter: nextFrontmatter,
        subtitle: current.subtitle,
        author: next,
        body: current.body,
      };
      persistMarkdownRef.current(
        packDocument(
          updated.frontmatter,
          updated.subtitle,
          updated.author,
          updated.body
        )
      );
      return updated;
    });
  }, []);

  const titleField = (
    <EssayTitleBlock
      title={essayTitle}
      subtitle={subtitle}
      author={author}
      onTitleCommit={setEssayTitle}
      onSubtitleCommit={commitSubtitle}
      onAuthorCommit={commitAuthor}
      onFocusBody={() => {
        editorRef.current?.commands.focus("start");
      }}
      titleDisabled={!canRenameDocument && Boolean(nodeId) && !previewMode}
    />
  );

  // After a conflict resolution, reload the canonical remote into the editor
  // once per conflict copy (not on every later status emit).
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
        const unpacked = unpackDocument(opened.markdown);
        setDoc({
          frontmatter: unpacked.frontmatter,
          subtitle: unpacked.subtitle,
          author: unpacked.author,
          body: unpacked.body,
        });
        setBaseVersion(opened.baseVersion);
      });
    });
  }, [persistEnabled, nodeId]);

  // Flush on blur / hide / offline reconnect.
  useEffect(() => {
    if (!persistEnabled || !nodeId) return;

    function flush() {
      void flushSyncQueue().then(() => onRequestTreeRefresh?.());
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
  }, [persistEnabled, nodeId, onRequestTreeRefresh]);

  function toSource() {
    flushMarkdownRef.current?.();
    const editor = editorRef.current;
    const nextBody = editor ? serializeBody(editor.getJSON()) : body;
    const packed = packDocument(frontmatter, subtitle, author, nextBody);
    if (nextBody !== body) {
      setDoc((current) => ({
        frontmatter: current.frontmatter,
        subtitle: current.subtitle,
        author: current.author,
        body: nextBody,
      }));
    }
    setSourceText(packed);
    setMode("source");
  }

  function toWysiwyg(force = false) {
    if (!force && isLossy(sourceText)) {
      setLossyWarning(true);
      setLossyDiffOpen(false);
      return;
    }
    setLossyWarning(false);
    setLossyDiffOpen(false);
    const unpacked = unpackDocument(sourceText, documentName);
    setDoc({
      frontmatter: unpacked.frontmatter,
      subtitle: unpacked.subtitle,
      author: unpacked.author,
      body: unpacked.body,
    });
    setMode("wysiwyg");
    persistMarkdown(
      packDocument(
        unpacked.frontmatter,
        unpacked.subtitle,
        unpacked.author,
        unpacked.body
      )
    );
  }

  const lossyDiffLines = lossyWarning
    ? compactDiff(
        unifiedLineDiff(sourceText, previewRoundTrip(sourceText)),
        2
      )
    : [];

  function currentMarkdown(): string {
    flushMarkdownRef.current?.();
    const editor = editorRef.current;
    const nextBody = editor ? serializeBody(editor.getJSON()) : body;
    return mode === "source"
      ? sourceText
      : packDocument(frontmatter, subtitle, author, nextBody);
  }

  async function exportMarkdownFile() {
    downloadMarkdown(
      currentMarkdown(),
      documentName ?? `${essayTitle}.md`
    );
  }

  async function copyForExport() {
    const markdown = currentMarkdown();
    const editor = editorRef.current;
    const html =
      mode === "wysiwyg" && editor
        ? editor.getHTML()
        : `<pre>${markdown
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")}</pre>`;
    try {
      await copyDocumentForPaste({
        markdown,
        html,
        title: essayTitle,
      });
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

  const overflowItems = [
    {
      id: "copy",
      label: "Copy",
      onSelect: () => {
        void copyForExport();
      },
    },
    {
      id: "export",
      label: "Export .md",
      onSelect: () => {
        void exportMarkdownFile();
      },
    },
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
    {
      id: "mode",
      label: mode === "wysiwyg" ? "See markdown" : "Rich text",
      onSelect: () => {
        if (mode === "wysiwyg") toSource();
        else toWysiwyg();
      },
    },
    ...(mode === "wysiwyg"
      ? [
          {
            id: "fix-notes",
            label: "Fix notes",
            onSelect: () => {
              void convertFootnoteLinks();
            },
          },
        ]
      : []),
    {
      id: "essay-settings",
      label: "Essay settings",
      onSelect: () => setEssaySettingsOpen(true),
    },
  ];

  const toolbarActions = (
    <>
      {nodeId && !previewMode && (
        <button
          type="button"
          onClick={() => {
            flushMarkdownRef.current?.();
            openPopOut(nodeId, essayTitle);
          }}
          className="rounded border border-border px-2.5 py-1 text-xs text-muted hover:bg-panel hover:text-foreground"
          title="Pop out this essay in a floating window"
        >
          Pop out
        </button>
      )}
      {mode === "wysiwyg" && (
        <button
          type="button"
          onClick={() => updatePrefs({ sidenotes: !prefs.sidenotes })}
          aria-pressed={prefs.sidenotes}
          className={`hidden rounded border border-border px-2.5 py-1 text-xs md:inline-block ${
            prefs.sidenotes
              ? "bg-accent/15 text-accent"
              : "text-muted hover:bg-panel hover:text-foreground"
          }`}
          title="Show footnotes in the margin"
        >
          Sidenotes
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

  if (mode === "source") {
    return (
      <div className="flex h-full flex-col">
        <div className="flex shrink-0 items-center justify-between border-b border-border px-3 py-1.5">
          <span className="text-xs font-mono uppercase tracking-wider text-muted">
            Markdown source
          </span>
          <span className="flex items-center gap-1">{toolbarActions}</span>
        </div>

        {lossyWarning && (
          <div
            role="alert"
            className="border-b border-amber-500/40 bg-amber-500/10 px-4 py-2.5 text-sm"
          >
            <div className="flex flex-wrap items-center gap-3">
              <span>
                Switching to rich text would rewrite parts of this markdown
                (normalization or unsupported constructs).
              </span>
              <span className="flex flex-wrap gap-2 ml-auto">
                <button
                  type="button"
                  onClick={() => setLossyDiffOpen((open) => !open)}
                  className="rounded border border-border px-2.5 py-1 text-xs hover:bg-panel"
                >
                  {lossyDiffOpen ? "Hide diff" : "See diff"}
                </button>
                <button
                  type="button"
                  onClick={() => toWysiwyg(true)}
                  className="rounded bg-amber-600 px-2.5 py-1 text-xs font-medium text-white hover:opacity-90"
                >
                  Switch anyway
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setLossyWarning(false);
                    setLossyDiffOpen(false);
                  }}
                  className="rounded border border-border px-2.5 py-1 text-xs hover:bg-panel"
                >
                  Stay in source
                </button>
              </span>
            </div>
            {lossyDiffOpen && (
              <pre className="lossy-diff mt-2 max-h-56 overflow-auto rounded border border-border bg-background p-2 font-mono text-[0.7rem] leading-snug">
                {lossyDiffLines.length === 0 ? (
                  <span className="text-muted">No line-level changes detected.</span>
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
          value={sourceText}
          onChange={(e) => {
            setSourceText(e.target.value);
            setLossyWarning(false);
            persistMarkdown(e.target.value);
          }}
          spellCheck={prefs.spellcheckEnabled}
          lang={
            (documentLanguages[0] ?? prefs.spellcheckLanguages[0]) || "en"
          }
          aria-label="Markdown source"
          className="min-h-0 w-full flex-1 resize-none bg-transparent px-6 py-6 font-mono text-sm leading-relaxed outline-none"
        />
        {shellDock}
        <EssaySettingsPanel
          open={essaySettingsOpen}
          onClose={() => setEssaySettingsOpen(false)}
          title={essayTitle}
          onTitleChange={setEssayTitle}
          documentLanguages={documentLanguages}
          onDocumentLanguagesChange={setDocumentLanguages}
          canEditTitle={canRenameDocument}
        />
      </div>
    );
  }

  return (
    <>
      <DocumentEditor
        key={nodeId ?? "preview"}
        markdown={body}
        onChange={(md) => {
          setDoc((current) => {
            persistMarkdownRef.current(
              packDocument(
                current.frontmatter,
                current.subtitle,
                current.author,
                md
              )
            );
            return {
              frontmatter: current.frontmatter,
              subtitle: current.subtitle,
              author: current.author,
              body: md,
            };
          });
        }}
        onDeletedFootnotesChange={onDeletedFootnotesChange}
        editorRef={editorRef}
        flushMarkdownRef={flushMarkdownRef}
        titleSlot={titleField}
        shellDock={shellDock}
        spellcheckLanguages={
          documentLanguages.length > 0
            ? documentLanguages
            : prefs.spellcheckLanguages
        }
        toolbarExtra={toolbarActions}
      />
      <EssaySettingsPanel
        open={essaySettingsOpen}
        onClose={() => setEssaySettingsOpen(false)}
        title={essayTitle}
        onTitleChange={setEssayTitle}
        documentLanguages={documentLanguages}
        onDocumentLanguagesChange={setDocumentLanguages}
        canEditTitle={canRenameDocument}
      />
    </>
  );
}
