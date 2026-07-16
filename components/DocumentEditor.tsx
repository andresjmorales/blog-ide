"use client";

import { useEffect } from "react";
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
import { FootnoteNodeView } from "@/components/FootnoteNodeView";

type Props = {
  /** Markdown body (frontmatter already stripped by the caller). */
  markdown: string;
  onChange: (markdown: string) => void;
  sidenotes?: boolean;
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
  sidenotes = false,
  toolbarExtra,
}: Props) {
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

  // Replace content when the caller switches documents / returns from source
  // view. Guard against feeding the editor its own onChange output.
  useEffect(() => {
    if (!editor) return;
    if (serializeBody(editor.getJSON()) !== markdown) {
      editor.commands.setContent(parseBody(markdown), {
        emitUpdate: false,
      });
    }
  }, [editor, markdown]);

  return (
    <div className="flex flex-col h-full">
      {editor && <Toolbar editor={editor} extra={toolbarExtra} />}
      <div
        className={`flex-1 overflow-y-auto ${
          sidenotes ? "show-sidenotes" : ""
        }`}
      >
        <div
          className={`mx-auto px-6 py-10 ${
            sidenotes ? "max-w-5xl" : "max-w-2xl"
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

  function setLink() {
    const previous = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("Link URL", previous ?? "https://");
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().unsetLink().run();
      return;
    }
    editor.chain().focus().setLink({ href: url }).run();
  }

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
        label="B"
        title="Bold (Ctrl+B)"
        active={state.bold}
        onClick={() => editor.chain().focus().toggleBold().run()}
        className="font-bold"
      />
      <ToolButton
        label="I"
        title="Italic (Ctrl+I)"
        active={state.italic}
        onClick={() => editor.chain().focus().toggleItalic().run()}
        className="italic"
      />
      <ToolButton
        label="S"
        title="Strikethrough"
        active={state.strike}
        onClick={() => editor.chain().focus().toggleStrike().run()}
        className="line-through"
      />
      <ToolButton
        label="<>"
        title="Inline code (Ctrl+E)"
        active={state.code}
        onClick={() => editor.chain().focus().toggleCode().run()}
        className="font-mono text-xs"
      />
      <ToolButton label="Link" title="Add or edit link" active={state.link} onClick={setLink} />

      <span className="mx-1.5 h-4 w-px bg-border" aria-hidden />

      <ToolButton
        label={"\u201C\u201D"}
        title="Blockquote"
        active={state.blockquote}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
      />
      <ToolButton
        label="• List"
        title="Bullet list"
        active={state.bulletList}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      />
      <ToolButton
        label="1. List"
        title="Ordered list"
        active={state.orderedList}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      />
      <ToolButton
        label="{ }"
        title="Code block"
        active={state.codeBlock}
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        className="font-mono text-xs"
      />
      <ToolButton
        label="—"
        title="Horizontal rule"
        onClick={() => editor.chain().focus().setHorizontalRule().run()}
      />
      <ToolButton label="Img" title="Insert image" onClick={insertImage} />
      <ToolButton
        label="Fn"
        title="Insert footnote (Ctrl+Shift+F)"
        onClick={() => editor.chain().focus().insertFootnote().run()}
      />

      {extra && <div className="ml-auto">{extra}</div>}
    </div>
  );
}

function ToolButton({
  label,
  title,
  active = false,
  onClick,
  className = "",
}: {
  label: string;
  title: string;
  active?: boolean;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`min-w-8 rounded px-2 py-1 ${
        active ? "bg-accent/15 text-accent" : "text-muted hover:bg-panel hover:text-foreground"
      } ${className}`}
    >
      {label}
    </button>
  );
}
