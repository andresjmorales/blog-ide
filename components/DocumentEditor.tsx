"use client";

import { useEffect, useRef, useState } from "react";
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
import { promptForLink } from "@/lib/editor/linkShortcut";
import { ItalicIcon, LinkIcon } from "@/components/icons";
import { SpecialCharsMenu } from "@/components/SpecialCharsMenu";
import { useEditorPrefs } from "@/components/EditorPrefsContext";
import { useStickySidenotes } from "@/components/useStickySidenotes";
import type { DeletedFootnote } from "@/lib/markdown/deletedFootnotes";

type Props = {
  /** Markdown body (frontmatter already stripped by the caller). */
  markdown: string;
  onChange: (markdown: string) => void;
  onDeletedFootnotesChange?: (deleted: DeletedFootnote[]) => void;
  editorRef?: React.MutableRefObject<Editor | null>;
  /** Rendered right-aligned in the toolbar row (e.g. the source toggle). */
  toolbarExtra?: React.ReactNode;
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
  onChange,
  onDeletedFootnotesChange,
  editorRef,
  toolbarExtra,
}: Props) {
  const { prefs } = useEditorPrefs();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [scrollEl, setScrollEl] = useState<HTMLElement | null>(null);
  const stickyEnabled =
    prefs.sidenotes && prefs.sidenoteLayout === "sticky";

  useStickySidenotes(scrollEl, stickyEnabled);

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
      },
    },
    onUpdate: ({ editor }) => {
      onChange(serializeBody(editor.getJSON()));
    },
  });

  useEffect(() => {
    if (editorRef) editorRef.current = editor;
    return () => {
      if (editorRef) editorRef.current = null;
    };
  }, [editor, editorRef]);

  useEffect(() => {
    if (!editor || !onDeletedFootnotesChange) return;
    const sync = () => {
      const list = Array.isArray(editor.state.doc.attrs.deletedFootnotes)
        ? (editor.state.doc.attrs.deletedFootnotes as DeletedFootnote[])
        : [];
      onDeletedFootnotesChange(list);
    };
    sync();
    editor.on("transaction", sync);
    return () => {
      editor.off("transaction", sync);
    };
  }, [editor, onDeletedFootnotesChange]);

  // Replace content when the caller switches documents / returns from source
  // view. Guard against feeding the editor its own onChange output.
  useEffect(() => {
    if (!editor) return;
    if (serializeBody(editor.getJSON()) !== markdown) {
      withoutFootnoteDeletionTracking(() => {
        editor.commands.setContent(parseBody(markdown), {
          emitUpdate: false,
        });
      });
    }
  }, [editor, markdown]);

  return (
    <div className="flex flex-col h-full">
      {editor && <Toolbar editor={editor} extra={toolbarExtra} />}
      <div
        ref={(node) => {
          scrollRef.current = node;
          setScrollEl(node);
        }}
        className={`flex-1 overflow-y-auto ${
          prefs.sidenotes ? "show-sidenotes" : ""
        } ${stickyEnabled ? "sidenotes-sticky" : ""}`}
      >
        <div
          className={`mx-auto px-6 py-10 ${
            prefs.sidenotes ? "max-w-5xl" : "max-w-2xl"
          }`}
        >
          <EditorContent editor={editor} />
        </div>
      </div>
    </div>
  );
}

function Toolbar({ editor, extra }: { editor: Editor; extra?: React.ReactNode }) {
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

  function insertImage() {
    const src = window.prompt(
      "Image path or URL (upload pipeline arrives in milestone 5)",
      "assets/"
    );
    if (!src) return;
    const alt = window.prompt("Alt text", "") ?? "";
    editor.chain().focus().setImage({ src, alt }).run();
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
        onClick={() => promptForLink(editor)}
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
      <ToolButton title="Insert image" onClick={insertImage}>
        Img
      </ToolButton>
      <ToolButton
        title="Insert footnote (Ctrl+Shift+F)"
        onClick={() => editor.chain().focus().insertFootnote().run()}
      >
        Fn
      </ToolButton>

      <span className="mx-1.5 h-4 w-px bg-border" aria-hidden />

      <SpecialCharsMenu editor={editor} />

      {extra && <div className="ml-auto">{extra}</div>}
    </div>
  );
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
