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
import {
  promptForLink,
  setLinkPromptHandler,
} from "@/lib/editor/linkShortcut";
import { ImageIcon, ItalicIcon, LinkIcon } from "@/components/icons";
import { SpecialCharsMenu } from "@/components/SpecialCharsMenu";
import { DocumentOutline } from "@/components/DocumentOutline";
import { useEditorPrefs } from "@/components/EditorPrefsContext";
import { SidenoteRail } from "@/components/SidenoteRail";
import { DeletedFootnotesPanel } from "@/components/DeletedFootnotesPanel";
import { LinkHoverCard } from "@/components/editor/LinkHoverCard";
import { useAppDialog } from "@/components/AppDialog";
import { primaryLang } from "@/lib/markdown/spellcheckFrontmatter";
import type { DeletedFootnote } from "@/lib/markdown/deletedFootnotes";
import { transformPastedFootnoteHtml } from "@/lib/import/footnotePaste";
import {
  compressImageFile,
  pickImageFile,
  pickPdfFile,
} from "@/lib/assets/imagePipeline";
import { uploadUserAsset } from "@/lib/assets/upload";
import { openPdfPin } from "@/lib/pins/pinStore";

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
};

function withFootnoteNodeView(extension: AnyExtension): AnyExtension {
  if (extension.name !== "footnoteRef") return extension;
  return extension.extend({
    addNodeView() {
      return ReactNodeViewRenderer(FootnoteNodeView);
    },
  });
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
}: Props) {
  const { prefs } = useEditorPrefs();
  const dialog = useAppDialog();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [scrollEl, setScrollEl] = useState<HTMLElement | null>(null);
  const [outlineOpen, setOutlineOpen] = useState(true);
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
      ...createExtensions().map(withFootnoteNodeView),
      Placeholder.configure({ placeholder: "Start writing…" }),
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

  useEffect(() => {
    return () => {
      if (emitTimerRef.current) window.clearTimeout(emitTimerRef.current);
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
    setLinkPromptHandler(async (previous) =>
      dialog.prompt({
        title: "Link URL",
        message: "Leave blank to remove an existing link.",
        defaultValue: previous ?? "https://",
        confirmLabel: "Apply",
      })
    );
    return () => setLinkPromptHandler(null);
  }, [dialog]);

  useEffect(() => {
    if (!editor) return;
    const dom = editor.view.dom as HTMLElement;
    dom.setAttribute("spellcheck", spellcheckOn ? "true" : "false");
    dom.setAttribute("lang", lang);
  }, [editor, spellcheckOn, lang]);

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
        <Toolbar editor={editor} extra={toolbarExtra} />
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
              {/* Anchored / sidenotes-off: keep restore UI per-essay. */}
              {!railEnabled && (
                <DeletedFootnotesPanel variant="inline" defaultOpen={false} />
              )}
            </div>
          </div>
          {shellDock}
          <LinkHoverCard editor={editor} />
        </div>
        {railEnabled && editor && (
          <SidenoteRail editor={editor} scrollRoot={scrollEl} />
        )}
      </div>
    </div>
  );
}

function Toolbar({
  editor,
  extra,
}: {
  editor: Editor;
  extra?: React.ReactNode;
}) {
  const dialog = useAppDialog();
  const state = useEditorState({
    editor,
    selector: ({ editor }) => ({
      bold: editor.isActive("bold"),
      italic: editor.isActive("italic"),
      code: editor.isActive("code"),
      strike: editor.isActive("strike"),
      link: editor.isActive("link"),
      blockquote: editor.isActive("blockquote"),
      bulletList: editor.isActive("bulletList"),
      orderedList: editor.isActive("orderedList"),
      codeBlock: editor.isActive("codeBlock"),
      heading: [1, 2, 3, 4].find((l) => editor.isActive("heading", { level: l })) ?? 0,
    }),
  });

  async function insertImage() {
    const choice = await dialog.confirm({
      title: "Insert image",
      message: "Upload and compress a local image, or paste a URL instead?",
      confirmLabel: "Upload file",
      cancelLabel: "Use URL",
    });

    let src: string | null = null;
    if (choice) {
      const file = await pickImageFile();
      if (!file) return;
      try {
        const compressed = await compressImageFile(file);
        try {
          const ext = compressed.mime === "image/webp" ? "webp" : "jpg";
          src = await uploadUserAsset(
            compressed.blob,
            file.name.replace(/\.\w+$/, "") + `.${ext}`
          );
        } catch {
          // Storage optional — fall back to a data URL for local use.
          src = await blobToDataUrl(compressed.blob);
        }
      } catch (err) {
        await dialog.confirm({
          title: "Image failed",
          message:
            err instanceof Error ? err.message : "Could not process image.",
          confirmLabel: "OK",
          cancelLabel: "Close",
        });
        return;
      }
    } else {
      src = await dialog.prompt({
        title: "Image URL",
        message: "Path or URL for the image.",
        defaultValue: "https://",
        confirmLabel: "Next",
      });
    }
    if (!src) return;
    const alt =
      (await dialog.prompt({
        title: "Alt text",
        message: "Optional description for accessibility.",
        defaultValue: "",
        confirmLabel: "Insert",
      })) ?? "";
    editor.chain().focus().setImage({ src, alt }).run();
  }

  async function pinPdf() {
    const file = await pickPdfFile();
    if (!file) return;
    const src = URL.createObjectURL(file);
    openPdfPin({
      src,
      title: file.name.replace(/\.pdf$/i, "") || "PDF",
      revokeOnClose: true,
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b border-border px-3 py-1.5 text-sm shrink-0">
      <select
        aria-label="Paragraph style"
        value={state.heading}
        onChange={(e) => {
          const level = Number(e.target.value);
          if (level === 0) {
            editor.chain().focus().setParagraph().run();
          } else {
            editor
              .chain()
              .focus()
              .setHeading({ level: level as 1 | 2 | 3 | 4 })
              .run();
          }
        }}
        className="mr-2 rounded border border-border bg-panel px-1.5 py-1 text-xs outline-none"
      >
        <option value={0}>Paragraph</option>
        <option value={1}>Heading 1</option>
        <option value={2}>Heading 2</option>
        <option value={3}>Heading 3</option>
        <option value={4}>Heading 4</option>
      </select>

      <ToolButton
        title="Bold (Ctrl+B)"
        active={state.bold}
        onClick={() => editor.chain().focus().toggleBold().run()}
        className="font-bold"
      >
        B
      </ToolButton>
      <ToolButton
        title="Italic (Ctrl+I)"
        active={state.italic}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <ItalicIcon />
      </ToolButton>
      <ToolButton
        title="Strikethrough"
        active={state.strike}
        onClick={() => editor.chain().focus().toggleStrike().run()}
        className="line-through"
      >
        S
      </ToolButton>
      <ToolButton
        title="Inline code (Ctrl+E)"
        active={state.code}
        onClick={() => editor.chain().focus().toggleCode().run()}
        className="font-mono text-xs"
      >
        {"<>"}
      </ToolButton>
      <ToolButton
        title="Add or edit link (Ctrl+K)"
        active={state.link}
        onClick={() => {
          void promptForLink(editor);
        }}
      >
        <LinkIcon />
      </ToolButton>

      <span className="mx-1.5 h-4 w-px bg-border" aria-hidden />

      <ToolButton
        title="Blockquote"
        active={state.blockquote}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
      >
        {"\u201C\u201D"}
      </ToolButton>
      <ToolButton
        title="Bullet list"
        active={state.bulletList}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        • List
      </ToolButton>
      <ToolButton
        title="Ordered list"
        active={state.orderedList}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      >
        1. List
      </ToolButton>
      <ToolButton
        title="Code block"
        active={state.codeBlock}
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        className="font-mono text-xs"
      >
        {"{ }"}
      </ToolButton>
      <ToolButton
        title="Horizontal rule"
        onClick={() => editor.chain().focus().setHorizontalRule().run()}
      >
        —
      </ToolButton>
      <ToolButton title="Insert image" onClick={() => void insertImage()}>
        <ImageIcon />
      </ToolButton>
      <ToolButton
        title="Pin a PDF to scroll and copy from while writing"
        onClick={() => void pinPdf()}
      >
        PDF
      </ToolButton>
      <ToolButton
        title="Insert footnote (Ctrl+Shift+F)"
        onClick={() => editor.chain().focus().insertFootnote().run()}
      >
        Footnote
      </ToolButton>

      <span className="mx-1.5 h-4 w-px bg-border" aria-hidden />

      <SpecialCharsMenu editor={editor} />

      {extra && <div className="ml-auto flex items-center gap-1">{extra}</div>}
    </div>
  );
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function ToolButton({
  title,
  active = false,
  onClick,
  className = "",
  children,
}: {
  title: string;
  active?: boolean;
  onClick: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`inline-flex min-w-8 items-center justify-center rounded px-2 py-1 ${
        active ? "bg-accent/15 text-accent" : "text-muted hover:bg-panel hover:text-foreground"
      } ${className}`}
    >
      {children}
    </button>
  );
}
