"use client";

import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import {
  EditorContent,
  ReactNodeViewRenderer,
  useEditor,
} from "@tiptap/react";
import type { AnyExtension, Editor } from "@tiptap/core";
import { Placeholder } from "@tiptap/extensions";
import { createExtensions } from "@/lib/editor/extensions";
import { parseBody, serializeBody } from "@/lib/markdown/pipeline";
import { withoutFootnoteDeletionTracking } from "@/lib/editor/footnoteDeletion";
import { FootnoteNodeView } from "@/components/FootnoteNodeView";
import { ImageCaptionNodeView } from "@/components/ImageCaptionNodeView";
import {
  BlockMathNodeView,
  InlineMathNodeView,
} from "@/components/MathNodeView";
import {
  isFindHotkeyTarget,
  isFindReplaceHotkey,
  isInsertFootnoteHotkey,
} from "@/lib/editor/findHotkey";
import { PanelCaret } from "@/components/icons";
import type { DocRange } from "@/lib/editor/findReplaceInEditor";
import { FormattingToolbar } from "@/components/FormattingToolbar";
import { FindReplacePanel } from "@/components/FindReplacePanel";
import { CitationInsertDialog } from "@/components/CitationInsertDialog";
import { ShortcutCheatsheet } from "@/components/ShortcutCheatsheet";
import { DocumentOutline } from "@/components/DocumentOutline";
import { useEditorPrefs } from "@/components/EditorPrefsContext";
import { useAppDialog } from "@/components/AppDialog";
import { SidenoteRail } from "@/components/SidenoteRail";
import { DeletedFootnotesPanel } from "@/components/DeletedFootnotesPanel";
import { LinkEditCard } from "@/components/editor/LinkEditCard";
import { EssaySpellcheckProvider } from "@/components/EssaySpellcheckContext";
import { HarperLintCard } from "@/components/HarperLintCard";
import { HarperHighlight } from "@/lib/editor/harper/HarperHighlight";
import { BibleRefHighlight } from "@/lib/editor/bible/BibleRefHighlight";
import { dialectFromLang } from "@/lib/editor/harper/dialect";
import { applyEditorDomLang } from "@/lib/editor/domAttrs";
import { primaryLang } from "@/lib/markdown/spellcheckFrontmatter";
import type { DeletedFootnote } from "@/lib/markdown/deletedFootnotes";
import { transformPastedFootnoteHtml } from "@/lib/import/footnotePaste";
import {
  collapseExtraBlankLines,
  normalizePastedHtml,
  sliceFromPastedPlainText,
} from "@/lib/editor/normalizePastedWhitespace";
import { TableControls } from "@/components/TableControls";
import {
  firstImageFile,
  insertEssayImageFromFile,
} from "@/lib/editor/insertEssayImage";

const BibleHoverCard = lazy(() =>
  import("@/components/BibleHoverCard").then((mod) => ({
    default: mod.BibleHoverCard,
  }))
);

type Props = {
  /** Markdown body (frontmatter already stripped by the caller). */
  markdown: string;
  onChange: (markdown: string) => void;
  onDeletedFootnotesChange?: (deleted: DeletedFootnote[]) => void;
  editorRef?: React.MutableRefObject<Editor | null>;
  /** Flush pending debounced onChange (e.g. before switching to source view). */
  flushMarkdownRef?: React.MutableRefObject<(() => void) | null>;
  /** Rendered right-aligned in the toolbar row (e.g. the source toggle). */
  toolbarExtra?: React.ReactNode;
  /** Substack-style title field above the body (not a Heading 1). */
  titleSlot?: React.ReactNode;
  /** Effective spellcheck on/off for this essay (global ⊕ override). */
  spellcheckEnabled?: boolean;
  /** Effective spellcheck language tags for this essay. */
  spellcheckLanguages?: string[];
  /**
   * Docked Shell (or similar) under the prose column only — Outline and
   * sidenote rail stay full-height beside it (Cursor-style bottom panel).
   */
  shellDock?: ReactNode;
  cleanupOpen?: boolean;
  onOpenCleanup?: () => void;
  /** Controlled outline rail (split mode snapshots / restores this). */
  outlineOpen?: boolean;
  onOutlineOpenChange?: (open: boolean) => void;
};

function withEditorNodeViews(extension: AnyExtension): AnyExtension {
  if (extension.name === "footnoteRef") {
    return extension.extend({
      addNodeView() {
        return ReactNodeViewRenderer(FootnoteNodeView, {
          stopEvent: ({ event }) => {
            const target = event.target;
            if (!(target instanceof Element)) return false;
            return Boolean(
              target.closest(
                ".footnote-ref, .footnote-sidenote, .footnote-sidenote-number, .footnote-sidenote-body"
              )
            );
          },
        });
      },
    });
  }
  if (extension.name === "image") {
    return extension.extend({
      addNodeView() {
        return ReactNodeViewRenderer(ImageCaptionNodeView);
      },
    });
  }
  if (extension.name === "inlineMath") {
    return extension.extend({
      addNodeView() {
        return ReactNodeViewRenderer(InlineMathNodeView);
      },
    });
  }
  if (extension.name === "blockMath") {
    return extension.extend({
      addNodeView() {
        return ReactNodeViewRenderer(BlockMathNodeView);
      },
    });
  }
  return extension;
}

export function DocumentEditor({
  markdown,
  titleSlot,
  onChange,
  onDeletedFootnotesChange,
  editorRef,
  flushMarkdownRef,
  toolbarExtra,
  spellcheckEnabled,
  spellcheckLanguages = [],
  shellDock,
  cleanupOpen = false,
  onOpenCleanup,
  outlineOpen: outlineOpenProp,
  onOutlineOpenChange,
}: Props) {
  const { prefs, updatePrefs } = useEditorPrefs();
  const dialog = useAppDialog();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [scrollEl, setScrollEl] = useState<HTMLElement | null>(null);
  const [outlineOpenLocal, setOutlineOpenLocal] = useState(true);
  const outlineOpen = outlineOpenProp ?? outlineOpenLocal;
  const setOutlineOpen = (next: boolean | ((prev: boolean) => boolean)) => {
    const value =
      typeof next === "function" ? next(outlineOpen) : next;
    if (onOutlineOpenChange) onOutlineOpenChange(value);
    else setOutlineOpenLocal(value);
  };
  const [findOpen, setFindOpen] = useState(false);
  /** Bumped on every Ctrl+F / Find click so an already-open panel refocuses. */
  const [findFocusNonce, setFindFocusNonce] = useState(0);
  const [findStickyRange, setFindStickyRange] = useState<DocRange | null>(null);
  const [citationOpen, setCitationOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  // Anchored layout is hidden for now — always use the sidenote rail.
  const railEnabled = prefs.sidenotes;
  const spellcheckOn = spellcheckEnabled ?? prefs.spellcheckEnabled;
  const markdownTypingShortcuts = prefs.markdownTypingShortcuts;
  const typography = prefs.typography;
  const effectiveLanguages =
    spellcheckLanguages.length > 0
      ? spellcheckLanguages
      : prefs.spellcheckLanguages;
  const lang = primaryLang(effectiveLanguages);
  const harperDialect = dialectFromLang(lang);

  // Avoid re-serializing / setContent loops on every parent render.
  const lastEmittedRef = useRef(markdown);
  const onChangeRef = useRef(onChange);
  const emitTimerRef = useRef(0);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const editor = useEditor(
    {
      // Placeholder is UI-only; it stays out of the shared markdown schema.
      extensions: [
        ...createExtensions({ markdownTypingShortcuts, typography }).map(
          withEditorNodeViews
        ),
        Placeholder.configure({
          placeholder: "Start writing…",
          // Default (true) only decorates the node holding the caret, so an
          // unfocused empty doc showed no placeholder at all.
          showOnlyCurrent: false,
        }),
        // Editor-only: not part of the shared markdown schema / round-trip set.
        HarperHighlight,
        BibleRefHighlight,
      ],
      content: parseBody(markdown),
      immediatelyRender: false,
      editorProps: {
        attributes: {
          class: "editor-prose outline-none min-h-[60vh]",
          "aria-label": "Document editor",
          // Browser spellcheck is intentionally off; Harper owns underlines.
          spellcheck: "false",
          lang,
        },
        transformPastedHTML(html) {
          return normalizePastedHtml(transformPastedFootnoteHtml(html));
        },
        transformPastedText(text) {
          return collapseExtraBlankLines(text);
        },
        clipboardTextParser(text, _context, _plain, view) {
          return sliceFromPastedPlainText(view.state.schema, text);
        },
      },
      onUpdate: ({ editor: current }) => {
        // TipTap already painted; defer markdown serialize + React/persist.
        if (emitTimerRef.current) window.clearTimeout(emitTimerRef.current);
        emitTimerRef.current = window.setTimeout(() => {
          emitTimerRef.current = 0;
          const next = serializeBody(current.getJSON());
          lastEmittedRef.current = next;
          onChangeRef.current(next);
        }, 160);
      },
    },
    [markdownTypingShortcuts, typography]
  );

  function openFind() {
    if (editor) {
      const { from, to, empty } = editor.state.selection;
      // Always refresh sticky from the live selection (same as a fresh Ctrl+F),
      // even when the find bar is already open.
      setFindStickyRange(empty ? null : { from, to });
    }
    setFindOpen(true);
    setFindFocusNonce((n) => n + 1);
  }

  const openFindRef = useRef(openFind);
  useEffect(() => {
    openFindRef.current = openFind;
  });

  // Flush the deferred serialize on unmount so a fast doc switch or tab
  // close can't drop the last ~160ms of typing.
  const editorForUnmountRef = useRef<Editor | null>(null);
  useEffect(() => {
    editorForUnmountRef.current = editor;
  }, [editor]);
  useEffect(() => {
    return () => {
      if (!emitTimerRef.current) return;
      window.clearTimeout(emitTimerRef.current);
      emitTimerRef.current = 0;
      const current = editorForUnmountRef.current;
      if (!current || current.isDestroyed) return;
      const next = serializeBody(current.getJSON());
      lastEmittedRef.current = next;
      onChangeRef.current(next);
    };
  }, []);

  useEffect(() => {
    if (!flushMarkdownRef) return;
    flushMarkdownRef.current = () => {
      if (!editor) return;
      if (emitTimerRef.current) {
        window.clearTimeout(emitTimerRef.current);
        emitTimerRef.current = 0;
      }
      const next = serializeBody(editor.getJSON());
      lastEmittedRef.current = next;
      onChangeRef.current(next);
    };
    return () => {
      flushMarkdownRef.current = null;
    };
  }, [editor, flushMarkdownRef]);

  useEffect(() => {
    if (!editor) return;
    applyEditorDomLang(editor.view.dom as HTMLElement, lang);
    editor.commands.setHarperDialect(harperDialect);
    editor.commands.setHarperEnabled(spellcheckOn && harperDialect != null);
    editor.commands.setHarperDisabledKinds(prefs.harperDisabledKinds);
    editor.commands.setHarperDictionary(prefs.harperDictionary);
    editor.commands.setBibleRefsEnabled(prefs.fetchBibleEnabled);
  }, [
    editor,
    spellcheckOn,
    lang,
    harperDialect,
    prefs.fetchBibleEnabled,
    prefs.harperDisabledKinds,
    prefs.harperDictionary,
  ]);

  // Paste / drop images into the essay (footnotes stay image-free via schema).
  useEffect(() => {
    if (!editor) return;
    const currentEditor = editor;
    const dom = currentEditor.view.dom;

    async function insertFile(file: File) {
      await insertEssayImageFromFile(currentEditor, file, {
        alertQuota: async () => {
          await dialog.confirm({
            title: "Storage quota exceeded",
            message:
              "This image would exceed your combined markdown + Storage quota. Free space in Settings (Clean unused images) or remove large files from the Library.",
            confirmLabel: "OK",
            cancelLabel: "Close",
          });
        },
        alertError: async (message) => {
          await dialog.confirm({
            title: "Image failed",
            message,
            confirmLabel: "OK",
            cancelLabel: "Close",
          });
        },
      });
    }

    function onPaste(event: ClipboardEvent) {
      const file = firstImageFile(event.clipboardData?.files);
      if (!file) return;
      event.preventDefault();
      event.stopPropagation();
      void insertFile(file);
    }

    function onDragOver(event: DragEvent) {
      if (!firstImageFile(event.dataTransfer?.files)) return;
      event.preventDefault();
    }

    function onDrop(event: DragEvent) {
      const file = firstImageFile(event.dataTransfer?.files);
      if (!file) return;
      event.preventDefault();
      event.stopPropagation();
      void insertFile(file);
    }

    dom.addEventListener("paste", onPaste);
    dom.addEventListener("dragover", onDragOver);
    dom.addEventListener("drop", onDrop);
    return () => {
      dom.removeEventListener("paste", onPaste);
      dom.removeEventListener("dragover", onDragOver);
      dom.removeEventListener("drop", onDrop);
    };
  }, [editor, dialog]);

  useEffect(() => {
    if (!editor) return;
    const shell =
      editor.view.dom.closest(".flex.flex-col.h-full") ?? editor.view.dom;
    function onKeyDown(event: KeyboardEvent) {
      if (!isFindReplaceHotkey(event)) return;
      // Essay, find bar, and portaled footnote cards. Not AI / explorer inputs.
      if (!isFindHotkeyTarget(event.target, shell)) return;
      event.preventDefault();
      openFindRef.current();
    }
    // Capture on document so Ctrl+F still works after Escape unmounts the
    // find input and leaves focus outside the editor shell.
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [editor]);

  useEffect(() => {
    if (!editor) return;
    const current = editor;
    const shell =
      current.view.dom.closest(".flex.flex-col.h-full") ?? current.view.dom;
    function onKeyDown(event: KeyboardEvent) {
      if (!isInsertFootnoteHotkey(event)) return;
      const target = event.target;
      if (target instanceof Node) {
        const inShell = shell.contains(target);
        const inFootnote =
          target instanceof Element &&
          Boolean(target.closest(".footnote-pin, .footnote-card"));
        const looseFocus =
          target === document.body ||
          target === document.documentElement ||
          !(target instanceof HTMLElement) ||
          (!target.closest(
            "input, textarea, select, [contenteditable='true']"
          ) &&
            !target.isContentEditable);
        if (!inShell && !inFootnote && !looseFocus) return;
      }
      event.preventDefault();
      event.stopPropagation();
      current.commands.insertFootnote();
    }
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [editor]);

  // Global ? cheatsheet when not typing in an input / the prose.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "?" || event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable ||
          target.closest(".ProseMirror"))
      ) {
        return;
      }
      event.preventDefault();
      setShortcutsOpen(true);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (editorRef) editorRef.current = editor;
    return () => {
      if (editorRef) editorRef.current = null;
    };
  }, [editor, editorRef]);

  useEffect(() => {
    if (!editor || !onDeletedFootnotesChange) return;
    let previous = "";
    const sync = () => {
      const list = Array.isArray(editor.state.doc.attrs.deletedFootnotes)
        ? (editor.state.doc.attrs.deletedFootnotes as DeletedFootnote[])
        : [];
      const key = JSON.stringify(list);
      if (key === previous) return;
      previous = key;
      onDeletedFootnotesChange(list);
    };
    sync();
    editor.on("transaction", sync);
    return () => {
      editor.off("transaction", sync);
    };
  }, [editor, onDeletedFootnotesChange]);

  // Replace content when the caller switches documents / returns from source
  // view. Compare to last emit — never re-serialize on every keystroke.
  useEffect(() => {
    if (!editor) return;
    if (markdown === lastEmittedRef.current) return;
    lastEmittedRef.current = markdown;
    withoutFootnoteDeletionTracking(() => {
      editor.commands.setContent(parseBody(markdown), {
        emitUpdate: false,
      });
    });
  }, [editor, markdown]);

  return (
    <EssaySpellcheckProvider
      value={{
        enabled: spellcheckOn,
        languages: effectiveLanguages,
        lang,
      }}
    >
      <div className="flex flex-col h-full">
        {editor && (
          <FormattingToolbar
            editor={editor}
            extra={toolbarExtra}
            onOpenFind={openFind}
            onOpenCitation={() => setCitationOpen(true)}
            cleanupOpen={cleanupOpen}
            onOpenCleanup={onOpenCleanup}
          />
        )}
        {editor && findOpen && (
          <FindReplacePanel
            key={
              findStickyRange
                ? `${findStickyRange.from}-${findStickyRange.to}`
                : "doc"
            }
            editor={editor}
            initialStickyRange={findStickyRange}
            focusNonce={findFocusNonce}
            onClose={() => {
              setFindOpen(false);
              // Return focus so the next Ctrl+F lands in a known place.
              queueMicrotask(() => {
                if (!editor.isDestroyed) editor.commands.focus();
              });
            }}
          />
        )}
        <div className="flex min-h-0 flex-1">
          {editor && (
            <DocumentOutline
              editor={editor}
              open={outlineOpen}
              onToggle={() => setOutlineOpen((open) => !open)}
            />
          )}
          {/* Prose + optional bottom dock — between Outline and Notes rail. */}
          <div
            className={`relative flex min-h-0 min-w-0 flex-1 flex-col ${
              prefs.sidenotes ? "show-sidenotes" : ""
            } ${railEnabled ? "sidenotes-rail" : ""}`}
          >
            <div
              ref={(node) => {
                scrollRef.current = node;
                setScrollEl((current) => (current === node ? current : node));
              }}
              className="min-h-0 min-w-0 flex-1 overflow-y-auto"
              data-blogide-editor-scroll=""
            >
              <div
                className={`mx-auto px-6 py-10 ${
                  railEnabled
                    ? "max-w-2xl"
                    : prefs.sidenotes
                      ? "max-w-5xl"
                      : "max-w-2xl"
                }`}
              >
                {titleSlot}
                <EditorContent editor={editor} />
                {editor && <TableControls editor={editor} />}
                {/* Anchored / sidenotes-off: keep restore UI per-essay. */}
                {!railEnabled && (
                  <DeletedFootnotesPanel variant="inline" defaultOpen={false} />
                )}
              </div>
            </div>
            {shellDock}
            <LinkEditCard editor={editor} showPreviews />
            <HarperLintCard editor={editor} />
            {prefs.fetchBibleEnabled ? (
              <Suspense fallback={null}>
                <BibleHoverCard editor={editor} />
              </Suspense>
            ) : null}
            {editor && (
              <CitationInsertDialog
                editor={editor}
                open={citationOpen}
                onClose={() => setCitationOpen(false)}
              />
            )}
            <ShortcutCheatsheet
              open={shortcutsOpen}
              onClose={() => setShortcutsOpen(false)}
            />
          </div>
          {railEnabled && editor && (
            <SidenoteRail
              editor={editor}
              scrollRoot={scrollEl}
              onCollapse={() => updatePrefs({ sidenotes: false })}
            />
          )}
          {!railEnabled && editor && (
            <aside className="footnote-rail-collapsed" aria-label="Footnotes">
              <button
                type="button"
                className="footnote-rail-collapsed-toggle"
                aria-expanded={prefs.sidenotes}
                title={
                  prefs.sidenotes
                    ? "Hide margin footnotes"
                    : "Show footnotes beside the essay"
                }
                onClick={() => updatePrefs({ sidenotes: !prefs.sidenotes })}
              >
                <PanelCaret
                  direction={prefs.sidenotes ? "right" : "left"}
                />
              </button>
            </aside>
          )}
        </div>
      </div>
    </EssaySpellcheckProvider>
  );
}
