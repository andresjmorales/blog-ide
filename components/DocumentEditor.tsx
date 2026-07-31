"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  EditorContent,
  ReactNodeViewRenderer,
  useEditor,
  useEditorState,
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
import { promptForLink } from "@/lib/editor/linkShortcut";
import {
  BulletListIcon,
  OrderedListIcon,
  PanelCaret,
  SearchIcon,
} from "@/components/icons";
import { BoldIcon } from "@/components/tiptap-icons/bold-icon";
import { ItalicIcon } from "@/components/tiptap-icons/italic-icon";
import { StrikeIcon } from "@/components/tiptap-icons/strike-icon";
import { Code2Icon } from "@/components/tiptap-icons/code2-icon";
import { CodeBlockIcon } from "@/components/tiptap-icons/code-block-icon";
import { LinkIcon } from "@/components/tiptap-icons/link-icon";
import { BlockquoteIcon } from "@/components/tiptap-icons/blockquote-icon";
import { Undo2Icon } from "@/components/tiptap-icons/undo2-icon";
import { Redo2Icon } from "@/components/tiptap-icons/redo2-icon";
import { SpecialCharsMenu } from "@/components/SpecialCharsMenu";
import { CleanupToolbarButton } from "@/components/CleanupDialog";
import { ConvertCaseMenu } from "@/components/ConvertCaseMenu";
import type { DocRange } from "@/lib/editor/findReplaceInEditor";
import { HeadingStyleMenu } from "@/components/HeadingStyleMenu";
import { FindReplacePanel } from "@/components/FindReplacePanel";
import { CitationInsertDialog } from "@/components/CitationInsertDialog";
import { ShortcutCheatsheet } from "@/components/ShortcutCheatsheet";
import { DocumentOutline } from "@/components/DocumentOutline";
import { useEditorPrefs } from "@/components/EditorPrefsContext";
import { useAppDialog } from "@/components/AppDialog";
import { SidenoteRail } from "@/components/SidenoteRail";
import { DeletedFootnotesPanel } from "@/components/DeletedFootnotesPanel";
import { LinkEditCard } from "@/components/editor/LinkEditCard";
import { primaryLang } from "@/lib/markdown/spellcheckFrontmatter";
import type { DeletedFootnote } from "@/lib/markdown/deletedFootnotes";
import { transformPastedFootnoteHtml } from "@/lib/import/footnotePaste";
import { ImageInsertMenu } from "@/components/ImageInsertMenu";
import { TableControls } from "@/components/TableControls";
import {
  firstImageFile,
  insertEssayImageFromFile,
} from "@/lib/editor/insertEssayImage";
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
  /** Effective spellcheck language tags for this essay. */
  spellcheckLanguages?: string[];
  /**
   * Docked Shell (or similar) under the prose column only — Outline and
   * sidenote rail stay full-height beside it (Cursor-style bottom panel).
   */
  shellDock?: ReactNode;
  cleanupOpen?: boolean;
  onOpenCleanup?: () => void;
};

function withEditorNodeViews(extension: AnyExtension): AnyExtension {
  if (extension.name === "footnoteRef") {
    return extension.extend({
      addNodeView() {
        return ReactNodeViewRenderer(FootnoteNodeView);
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
  spellcheckLanguages = [],
  shellDock,
  cleanupOpen = false,
  onOpenCleanup,
}: Props) {
  const { prefs, updatePrefs } = useEditorPrefs();
  const dialog = useAppDialog();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [scrollEl, setScrollEl] = useState<HTMLElement | null>(null);
  const [outlineOpen, setOutlineOpen] = useState(true);
  const [findOpen, setFindOpen] = useState(false);
  const [findStickyRange, setFindStickyRange] = useState<DocRange | null>(null);
  const [citationOpen, setCitationOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const railEnabled =
    prefs.sidenotes && prefs.sidenoteLayout === "sticky";
  const spellcheckOn = prefs.spellcheckEnabled;
  const lang = primaryLang(
    spellcheckLanguages.length > 0
      ? spellcheckLanguages
      : prefs.spellcheckLanguages
  );

  // Avoid re-serializing / setContent loops on every parent render.
  const lastEmittedRef = useRef(markdown);
  const onChangeRef = useRef(onChange);
  const emitTimerRef = useRef(0);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const editor = useEditor({
    // Placeholder is UI-only; it stays out of the shared markdown schema.
    extensions: [
      ...createExtensions().map(withEditorNodeViews),
      Placeholder.configure({
        placeholder: "Start writing…",
        // Default (true) only decorates the node holding the caret, so an
        // unfocused empty doc showed no placeholder at all.
        showOnlyCurrent: false,
      }),
    ],
    content: parseBody(markdown),
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: "editor-prose outline-none min-h-[60vh]",
        "aria-label": "Document editor",
        spellcheck: spellcheckOn ? "true" : "false",
        lang,
      },
      transformPastedHTML(html) {
        return transformPastedFootnoteHtml(html);
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
  });

  function openFind() {
    if (!editor) {
      setFindOpen(true);
      return;
    }
    const { from, to, empty } = editor.state.selection;
    // Always refresh sticky from the live selection (same as a fresh Ctrl+F),
    // even when the find bar is already open.
    setFindStickyRange(empty ? null : { from, to });
    setFindOpen(true);
  }

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
    const dom = editor.view.dom as HTMLElement;
    dom.setAttribute("spellcheck", spellcheckOn ? "true" : "false");
    dom.setAttribute("lang", lang);
  }, [editor, spellcheckOn, lang]);

  // Paste / drop images into the essay (footnotes stay image-free via schema).
  useEffect(() => {
    if (!editor) return;
    const currentEditor = editor;
    const dom = currentEditor.view.dom;

    async function insertFile(file: File) {
      await insertEssayImageFromFile(currentEditor, file, {
        promptAlt: async () =>
          dialog.prompt({
            title: "Alt text",
            message: "Optional description for accessibility.",
            defaultValue: "",
            confirmLabel: "Insert",
          }),
        alertQuota: async () => {
          await dialog.confirm({
            title: "Storage quota exceeded",
            message:
              "This image would exceed your combined markdown + Storage quota. Free space in Account settings (Clean unused images) or remove large files from the Library.",
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
    const current = editor;
    function onKeyDown(event: KeyboardEvent) {
      const mod = event.metaKey || event.ctrlKey;
      if (!mod) return;
      if (event.key !== "f" && event.key !== "F" && event.key !== "h" && event.key !== "H") {
        return;
      }
      event.preventDefault();
      const { from, to, empty } = current.state.selection;
      setFindStickyRange(empty ? null : { from, to });
      setFindOpen(true);
    }
    // Capture on the editor root so we win over the browser find UI.
    const root = current.view.dom.closest(".flex.flex-col.h-full") ?? document;
    root.addEventListener("keydown", onKeyDown as EventListener);
    return () => root.removeEventListener("keydown", onKeyDown as EventListener);
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
    <div className="flex flex-col h-full">
      {editor && (
        <Toolbar
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
          onClose={() => setFindOpen(false)}
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
          <LinkEditCard
            editor={editor}
            showPreviews={prefs.linkPreviews}
          />
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
  );
}

function Toolbar({
  editor,
  extra,
  onOpenFind,
  onOpenCitation,
  cleanupOpen,
  onOpenCleanup,
}: {
  editor: Editor;
  extra?: React.ReactNode;
  onOpenFind: () => void;
  onOpenCitation: () => void;
  cleanupOpen: boolean;
  onOpenCleanup?: () => void;
}) {
  const state = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      bold: current.isActive("bold"),
      italic: current.isActive("italic"),
      code: current.isActive("code"),
      strike: current.isActive("strike"),
      link: current.isActive("link"),
      blockquote: current.isActive("blockquote"),
      bulletList: current.isActive("bulletList"),
      orderedList: current.isActive("orderedList"),
      codeBlock: current.isActive("codeBlock"),
      canUndo: current.can().undo(),
      canRedo: current.can().redo(),
    }),
  });

  return (
    <div
      className="blogide-editor-toolbar shrink-0"
      role="toolbar"
      aria-label="Formatting"
    >
      <div className="blogide-editor-toolbar-group">
        <ToolButton
          title="Undo (Ctrl+Z)"
          disabled={!state.canUndo}
          onClick={() => editor.chain().focus().undo().run()}
        >
          <Undo2Icon className="blogide-tool-icon" />
        </ToolButton>
        <ToolButton
          title="Redo (Ctrl+Shift+Z)"
          disabled={!state.canRedo}
          onClick={() => editor.chain().focus().redo().run()}
        >
          <Redo2Icon className="blogide-tool-icon" />
        </ToolButton>
      </div>

      <span className="blogide-editor-toolbar-sep" aria-hidden />

      <div className="blogide-editor-toolbar-group">
        <HeadingStyleMenu editor={editor} />
        <ToolButton
          title="Bullet list"
          active={state.bulletList}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <BulletListIcon className="blogide-tool-icon" />
        </ToolButton>
        <ToolButton
          title="Ordered list"
          active={state.orderedList}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          <OrderedListIcon className="blogide-tool-icon" />
        </ToolButton>
      </div>

      <span className="blogide-editor-toolbar-sep" aria-hidden />

      <div className="blogide-editor-toolbar-group">
        <ToolButton
          title="Bold (Ctrl+B)"
          active={state.bold}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <BoldIcon className="blogide-tool-icon" />
        </ToolButton>
        <ToolButton
          title="Italic (Ctrl+I)"
          active={state.italic}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <ItalicIcon className="blogide-tool-icon" />
        </ToolButton>
        <ToolButton
          title="Strikethrough"
          active={state.strike}
          onClick={() => editor.chain().focus().toggleStrike().run()}
        >
          <StrikeIcon className="blogide-tool-icon" />
        </ToolButton>
        <ToolButton
          title="Inline code (Ctrl+E)"
          active={state.code}
          onClick={() => editor.chain().focus().toggleCode().run()}
        >
          <Code2Icon className="blogide-tool-icon" />
        </ToolButton>
        <ToolButton
          title="Code block"
          active={state.codeBlock}
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        >
          <CodeBlockIcon className="blogide-tool-icon" />
        </ToolButton>
        <ToolButton
          title="Add or edit link (Ctrl+K)"
          active={state.link}
          onClick={() => {
            void promptForLink(editor);
          }}
        >
          <LinkIcon className="blogide-tool-icon" />
        </ToolButton>
        <ToolButton title="Find (Ctrl+F)" onClick={onOpenFind}>
          <SearchIcon className="blogide-tool-icon" />
        </ToolButton>
        <ConvertCaseMenu editor={editor} />
        {onOpenCleanup && (
          <CleanupToolbarButton open={cleanupOpen} onOpen={onOpenCleanup} />
        )}
      </div>

      <span className="blogide-editor-toolbar-sep" aria-hidden />

      <div className="blogide-editor-toolbar-group">
        <ToolButton
          title="Blockquote"
          active={state.blockquote}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
        >
          <BlockquoteIcon className="blogide-tool-icon" />
        </ToolButton>
        <ToolButton
          title="Divider (horizontal rule)"
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
        >
          Div
        </ToolButton>
        <ToolButton
          title="Insert table"
          onClick={() =>
            editor
              .chain()
              .focus()
              .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
              .run()
          }
        >
          Table
        </ToolButton>
        <ToolButton
          title="Insert inline math"
          onClick={() => editor.chain().focus().insertInlineMath("x").run()}
        >
          TeX
        </ToolButton>
        <ImageInsertMenu editor={editor} />
        <ToolButton
          title="Insert footnote (Ctrl+Shift+F)"
          onClick={() => editor.chain().focus().insertFootnote().run()}
        >
          Footnote
        </ToolButton>
        <ToolButton title="Insert citation from BibTeX" onClick={onOpenCitation}>
          Cite
        </ToolButton>
      </div>

      <span className="blogide-editor-toolbar-sep" aria-hidden />

      <div className="blogide-editor-toolbar-group">
        <SpecialCharsMenu editor={editor} />
      </div>

      {extra ? <div className="blogide-toolbar-extra">{extra}</div> : null}
    </div>
  );
}

function ToolButton({
  title,
  active = false,
  disabled = false,
  onClick,
  children,
}: {
  title: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex h-8 min-w-8 items-center justify-center rounded px-2 text-[0.8125rem] leading-none disabled:opacity-40 ${
        active
          ? "bg-accent/15 text-accent"
          : "text-muted hover:bg-panel hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}
