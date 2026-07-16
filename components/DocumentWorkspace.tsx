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

const SAMPLE_DOC = `---
title: Welcome to BlogIDE
status: draft
---
# Welcome to BlogIDE

This is preview mode. Connect Supabase to persist documents.
`;

type Mode = "wysiwyg" | "source";

type Props = {
  nodeId: string | null;
  previewMode?: boolean;
  onDeletedFootnotesChange: (deleted: DeletedFootnote[]) => void;
  registerDeletedActions: (actions: {
    restore: (id: string) => void;
    dismiss: (id: string) => void;
  }) => void;
  onDocumentLoaded?: (markdown: string) => void;
  onRequestTreeRefresh?: () => void;
  onDocumentSpellcheckChange?: (meta: {
    languages: string[];
    setLanguages: (languages: string[]) => void;
    hasDocument: boolean;
  }) => void;
};

export function DocumentWorkspace({
  nodeId,
  previewMode = false,
  onDeletedFootnotesChange,
  registerDeletedActions,
  onDocumentLoaded,
  onRequestTreeRefresh,
  onDocumentSpellcheckChange,
}: Props) {
  const [{ frontmatter, body }, setDoc] = useState(() =>
    splitFrontmatter(SAMPLE_DOC)
  );
  const [mode, setMode] = useState<Mode>("wysiwyg");
  const [sourceText, setSourceText] = useState("");
  const [lossyWarning, setLossyWarning] = useState(false);
  const [lossyDiffOpen, setLossyDiffOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [baseVersion, setBaseVersion] = useState(1);
  const editorRef = useRef<Editor | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const baseVersionRef = useRef(1);
  const nodeIdRef = useRef(nodeId);
  const { prefs, updatePrefs } = useEditorPrefs();
  const persistEnabled = isSupabaseConfigured() && !previewMode && !!nodeId;
  const documentLanguages = parseSpellcheckLangs(frontmatter);
  const documentLanguagesKey = documentLanguages.join(",");
  const persistMarkdownRef = useRef<(full: string) => void>(() => {});
  const onSpellcheckChangeRef = useRef(onDocumentSpellcheckChange);

  useEffect(() => {
    onSpellcheckChangeRef.current = onDocumentSpellcheckChange;
  }, [onDocumentSpellcheckChange]);

  useEffect(() => {
    baseVersionRef.current = baseVersion;
  }, [baseVersion]);

  useEffect(() => {
    nodeIdRef.current = nodeId;
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
        setDoc(splitFrontmatter(SAMPLE_DOC));
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
        setDoc(splitFrontmatter(opened.markdown));
        setBaseVersion(opened.baseVersion);
        onDocumentLoaded?.(opened.markdown);
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

  const persistMarkdown = useCallback(
    (fullMarkdown: string) => {
      if (!persistEnabled || !nodeId) return;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        const version = baseVersionRef.current;
        void saveLocal(nodeId, fullMarkdown, version).then(() => {
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
    [persistEnabled, nodeId, onRequestTreeRefresh]
  );

  useEffect(() => {
    persistMarkdownRef.current = persistMarkdown;
  }, [persistMarkdown]);

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

  useEffect(() => {
    onSpellcheckChangeRef.current?.({
      languages: documentLanguagesKey
        ? documentLanguagesKey.split(",")
        : [],
      setLanguages: setDocumentLanguages,
      hasDocument: Boolean(nodeId) || previewMode,
    });
  }, [
    documentLanguagesKey,
    nodeId,
    previewMode,
    setDocumentLanguages,
  ]);

  // After a conflict resolution, reload the canonical remote into the editor.
  useEffect(() => {
    if (!persistEnabled || !nodeId) return;
    return subscribeSyncStatus((status) => {
      if (!status.conflictCopyId || !status.message) return;
      void openDocument(nodeId).then((opened) => {
        if (nodeIdRef.current !== nodeId) return;
        setDoc(splitFrontmatter(opened.markdown));
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
    const next = splitFrontmatter(sourceText);
    setDoc(next);
    setMode("wysiwyg");
    persistMarkdown(sourceText);
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
          {toggleButton}
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
      </div>
    );
  }

  return (
    <DocumentEditor
      key={nodeId ?? "preview"}
      markdown={body}
      onChange={(md) => {
        setDoc({ frontmatter, body: md });
        persistMarkdown(frontmatter + md);
      }}
      onDeletedFootnotesChange={onDeletedFootnotesChange}
      editorRef={editorRef}
      spellcheckLanguages={
        documentLanguages.length > 0
          ? documentLanguages
          : prefs.spellcheckLanguages
      }
      toolbarExtra={
        <span className="flex items-center gap-1">
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
  );
}
