"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/core";
import { DocumentEditor } from "@/components/DocumentEditor";
import { useEditorPrefs } from "@/components/EditorPrefsContext";
import { splitFrontmatter } from "@/lib/markdown/frontmatter";
import { compactDiff, unifiedLineDiff } from "@/lib/markdown/diff";
import { isLossy, previewRoundTrip } from "@/lib/markdown/pipeline";
import type { DeletedFootnote } from "@/lib/markdown/deletedFootnotes";
import { getLocalDoc } from "@/lib/db/indexed";
import {
  flushSyncQueue,
  openDocument,
  saveLocal,
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
import { EssaySettingsPanel } from "@/components/EssaySettingsPanel";

const SAMPLE_DOC = `---
title: Welcome to BlogIDE
status: draft
---

This is preview mode. Connect Supabase to persist documents.
`;

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
}: Props) {
  const [{ frontmatter, body }, setDoc] = useState(() => {
    const normalized = normalizeEssayTitle(SAMPLE_DOC);
    return {
      frontmatter: normalized.frontmatter,
      body: normalized.body,
    };
  });
  const [titleDraft, setTitleDraft] = useState(
    () => normalizeEssayTitle(SAMPLE_DOC).title
  );
  const [titleFocused, setTitleFocused] = useState(false);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when switching documents
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
        const normalized = normalizeEssayTitle(SAMPLE_DOC);
        setDoc({
          frontmatter: normalized.frontmatter,
          body: normalized.body,
        });
        setTitleDraft(normalized.title);
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
        const normalized = normalizeEssayTitle(
          opened.markdown,
          documentNameRef.current
        );
        setDoc({
          frontmatter: normalized.frontmatter,
          body: normalized.body,
        });
        setTitleDraft(normalized.title);
        setBaseVersion(opened.baseVersion);
        if (normalized.changed) {
          // Persist migration of legacy `# Title` out of the body.
          persistMarkdownRef.current(
            normalized.frontmatter + normalized.body
          );
        }
        onDocumentLoaded?.(normalized.frontmatter + normalized.body);
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

  // External rename (Files panel) → update frontmatter title.
  // Queue the write so we don't setState synchronously inside the effect body.
  useEffect(() => {
    if (!documentName || syncingNameRef.current) return;
    if (prevDocumentNameRef.current === documentName) return;
    prevDocumentNameRef.current = documentName;
    const fromFile = fileNameToTitle(documentName);
    const timer = window.setTimeout(() => {
      setDoc((prev) => {
        const current = parseTitle(prev.frontmatter);
        if (current === fromFile) return prev;
        const nextFrontmatter = writeTitle(prev.frontmatter, fromFile);
        const next = { frontmatter: nextFrontmatter, body: prev.body };
        persistMarkdownRef.current(nextFrontmatter + next.body);
        return next;
      });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [documentName]);

  const setDocumentLanguages = useCallback((languages: string[]) => {
    setDoc((current) => {
      const nextFrontmatter = writeSpellcheckLangs(
        current.frontmatter,
        languages
      );
      const next = { frontmatter: nextFrontmatter, body: current.body };
      persistMarkdownRef.current(nextFrontmatter + next.body);
      return next;
    });
  }, []);

  const setEssayTitle = useCallback(
    (title: string) => {
      const cleaned = title.trim() || "Untitled";
      setTitleDraft(cleaned);
      setDoc((current) => {
        const nextFrontmatter = writeTitle(current.frontmatter, cleaned);
        const next = { frontmatter: nextFrontmatter, body: current.body };
        persistMarkdownRef.current(nextFrontmatter + next.body);
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

  function commitTitleField(focusBody = false) {
    const next = titleDraft.trim() || "Untitled";
    if (next !== essayTitle) {
      setEssayTitle(next);
    } else {
      setTitleDraft(next);
    }
    setTitleFocused(false);
    if (focusBody) {
      requestAnimationFrame(() => {
        editorRef.current?.commands.focus("start");
      });
    }
  }

  // While focused, show the draft; otherwise show the committed title
  // (so external renames appear without a syncing effect).
  const titleFieldValue = titleFocused ? titleDraft : essayTitle;

  const titleField = (
    <input
      type="text"
      value={titleFieldValue}
      onFocus={() => {
        setTitleFocused(true);
        setTitleDraft(essayTitle);
      }}
      onChange={(e) => setTitleDraft(e.target.value)}
      onBlur={() => commitTitleField(false)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commitTitleField(true);
        }
      }}
      disabled={!canRenameDocument && Boolean(nodeId) && !previewMode}
      aria-label="Essay title"
      placeholder="Title"
      className="essay-title-input"
    />
  );

  // After a conflict resolution, reload the canonical remote into the editor.
  useEffect(() => {
    if (!persistEnabled || !nodeId) return;
    return subscribeSyncStatus((status) => {
      if (!status.conflictCopyId || !status.message) return;
      void openDocument(nodeId).then((opened) => {
        if (nodeIdRef.current !== nodeId) return;
        const normalized = normalizeEssayTitle(opened.markdown);
        setDoc({
          frontmatter: normalized.frontmatter,
          body: normalized.body,
        });
        setTitleDraft(normalized.title);
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
    setSourceText(frontmatter + body);
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
    const normalized = normalizeEssayTitle(sourceText, documentName);
    setDoc({
      frontmatter: normalized.frontmatter,
      body: normalized.body,
    });
    setTitleDraft(normalized.title);
    setMode("wysiwyg");
    persistMarkdown(normalized.frontmatter + normalized.body);
  }

  const lossyDiffLines = lossyWarning
    ? compactDiff(
        unifiedLineDiff(sourceText, previewRoundTrip(sourceText)),
        2
      )
    : [];

  const toggleButton =
    mode === "wysiwyg" ? (
      <button
        type="button"
        onClick={toSource}
        className="rounded border border-border px-2.5 py-1 text-xs font-mono text-muted hover:text-foreground hover:bg-panel"
        title="Edit raw markdown"
      >
        Markdown
      </button>
    ) : (
      <button
        type="button"
        onClick={() => toWysiwyg()}
        className="rounded border border-border px-2.5 py-1 text-xs text-muted hover:text-foreground hover:bg-panel"
        title="Back to rich text editing"
      >
        Rich text
      </button>
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
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between border-b border-border px-3 py-1.5 shrink-0">
          <span className="text-xs font-mono uppercase tracking-wider text-muted">
            Markdown source
          </span>
          <span className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setEssaySettingsOpen(true)}
              className="rounded border border-border px-2.5 py-1 text-xs text-muted hover:bg-panel hover:text-foreground"
              title="Essay settings"
            >
              Essay settings
            </button>
            {toggleButton}
          </span>
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
          className="flex-1 w-full resize-none bg-transparent px-6 py-6 font-mono text-sm leading-relaxed outline-none"
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
      </div>
    );
  }

  return (
    <>
      <DocumentEditor
        key={nodeId ?? "preview"}
        markdown={body}
        onChange={(md) => {
          setDoc({ frontmatter, body: md });
          persistMarkdown(frontmatter + md);
        }}
        onDeletedFootnotesChange={onDeletedFootnotesChange}
        editorRef={editorRef}
        titleSlot={titleField}
        spellcheckLanguages={
          documentLanguages.length > 0
            ? documentLanguages
            : prefs.spellcheckLanguages
        }
        toolbarExtra={
          <span className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setEssaySettingsOpen(true)}
              className="rounded border border-border px-2.5 py-1 text-xs text-muted hover:bg-panel hover:text-foreground"
              title="Essay settings"
            >
              Essay settings
            </button>
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
            {toggleButton}
          </span>
        }
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
