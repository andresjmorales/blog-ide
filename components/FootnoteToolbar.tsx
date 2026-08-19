"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { Editor } from "@tiptap/core";
import { useEditorState } from "@tiptap/react";
import { promptForLink } from "@/lib/editor/linkShortcut";
import { applyConvertCase, type CaseMode } from "@/lib/editor/applyConvertCase";
import { applyCleanWhitespace } from "@/lib/editor/applyCleanWhitespace";
import { fitToolbarItems } from "@/lib/editor/footnoteToolbar";
import { EditorOverflowMenu, type OverflowItem } from "@/components/EditorOverflowMenu";
import { SpecialCharsMenu } from "@/components/SpecialCharsMenu";
import { ConvertCaseMenu } from "@/components/ConvertCaseMenu";
import { CleanWhitespaceButton } from "@/components/CleanWhitespaceButton";
import {
  BulletListIcon,
  OrderedListIcon,
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

const CASE_MODES: { mode: CaseMode; label: string }[] = [
  { mode: "sentence", label: "Sentence case" },
  { mode: "upper", label: "UPPER CASE" },
  { mode: "lower", label: "lower case" },
  { mode: "title", label: "Title Case" },
  { mode: "capitalized", label: "Capitalized" },
];

type ToolKind = "item" | "sep" | "slot";

type ToolDef = {
  id: string;
  kind: ToolKind;
  title: string;
  overflowLabel: string;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  render?: () => ReactNode;
};

export function FootnoteToolbar({ editor }: { editor: Editor }) {
  const rowRef = useRef<HTMLSpanElement | null>(null);
  const widthsRef = useRef<number[] | null>(null);
  const [visibleCount, setVisibleCount] = useState<number | null>(null);
  const state = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      bold: current.isActive("bold"),
      italic: current.isActive("italic"),
      strike: current.isActive("strike"),
      code: current.isActive("code"),
      link: current.isActive("link"),
      blockquote: current.isActive("blockquote"),
      bulletList: current.isActive("bulletList"),
      orderedList: current.isActive("orderedList"),
      codeBlock: current.isActive("codeBlock"),
      canUndo: current.can().undo(),
      canRedo: current.can().redo(),
    }),
  });

  const tools: ToolDef[] = [
    {
      id: "undo",
      kind: "item",
      title: "Undo (Ctrl+Z)",
      overflowLabel: "Undo",
      disabled: !state.canUndo,
      onClick: () => editor.chain().focus().undo().run(),
      render: () => <Undo2Icon className="blogide-tool-icon" />,
    },
    {
      id: "redo",
      kind: "item",
      title: "Redo (Ctrl+Shift+Z)",
      overflowLabel: "Redo",
      disabled: !state.canRedo,
      onClick: () => editor.chain().focus().redo().run(),
      render: () => <Redo2Icon className="blogide-tool-icon" />,
    },
    { id: "sep-lists", kind: "sep", title: "", overflowLabel: "" },
    {
      id: "bullet",
      kind: "item",
      title: "Bullet list",
      overflowLabel: "Bullet list",
      active: state.bulletList,
      onClick: () => editor.chain().focus().toggleBulletList().run(),
      render: () => <BulletListIcon className="blogide-tool-icon" />,
    },
    {
      id: "ordered",
      kind: "item",
      title: "Ordered list",
      overflowLabel: "Ordered list",
      active: state.orderedList,
      onClick: () => editor.chain().focus().toggleOrderedList().run(),
      render: () => <OrderedListIcon className="blogide-tool-icon" />,
    },
    { id: "sep-marks", kind: "sep", title: "", overflowLabel: "" },
    {
      id: "bold",
      kind: "item",
      title: "Bold (Ctrl+B)",
      overflowLabel: "Bold",
      active: state.bold,
      onClick: () => editor.chain().focus().toggleBold().run(),
      render: () => <BoldIcon className="blogide-tool-icon" />,
    },
    {
      id: "italic",
      kind: "item",
      title: "Italic (Ctrl+I)",
      overflowLabel: "Italic",
      active: state.italic,
      onClick: () => editor.chain().focus().toggleItalic().run(),
      render: () => <ItalicIcon className="blogide-tool-icon" />,
    },
    {
      id: "strike",
      kind: "item",
      title: "Strikethrough",
      overflowLabel: "Strikethrough",
      active: state.strike,
      onClick: () => editor.chain().focus().toggleStrike().run(),
      render: () => <StrikeIcon className="blogide-tool-icon" />,
    },
    {
      id: "code",
      kind: "item",
      title: "Inline code",
      overflowLabel: "Inline code",
      active: state.code,
      onClick: () => editor.chain().focus().toggleCode().run(),
      render: () => <Code2Icon className="blogide-tool-icon" />,
    },
    {
      id: "codeBlock",
      kind: "item",
      title: "Code block",
      overflowLabel: "Code block",
      active: state.codeBlock,
      onClick: () => editor.chain().focus().toggleCodeBlock().run(),
      render: () => <CodeBlockIcon className="blogide-tool-icon" />,
    },
    {
      id: "quote",
      kind: "item",
      title: "Blockquote",
      overflowLabel: "Blockquote",
      active: state.blockquote,
      onClick: () => editor.chain().focus().toggleBlockquote().run(),
      render: () => <BlockquoteIcon className="blogide-tool-icon" />,
    },
    {
      id: "link",
      kind: "item",
      title: "Add or edit link (Ctrl+K)",
      overflowLabel: "Link",
      active: state.link,
      onClick: () => {
        void promptForLink(editor);
      },
      render: () => <LinkIcon className="blogide-tool-icon" />,
    },
    {
      id: "case",
      kind: "slot",
      title: "Convert case",
      overflowLabel: "Convert case",
      render: () => <ConvertCaseMenu editor={editor} />,
    },
    { id: "sep-extra", kind: "sep", title: "", overflowLabel: "" },
    {
      id: "chars",
      kind: "slot",
      title: "Special characters",
      overflowLabel: "Special characters",
      render: () => <SpecialCharsMenu editor={editor} />,
    },
    {
      id: "ws",
      kind: "slot",
      title: "Clean whitespace",
      overflowLabel: "Clean whitespace",
      render: () => <CleanWhitespaceButton editor={editor} />,
    },
  ];

  useLayoutEffect(() => {
    function measure() {
      const toolbar = rowRef.current;
      if (!toolbar) return;
      const overflowNode = toolbar.querySelector<HTMLElement>("[data-fn-overflow]");
      const overflowWidth = Math.max(overflowNode?.offsetWidth ?? 32, 36);
      const styles = window.getComputedStyle(toolbar);
      const gap = Number.parseFloat(styles.columnGap || styles.gap || "4") || 4;
      if (toolbar.clientWidth <= 0) return;
      const nodes = [
        ...toolbar.querySelectorAll<HTMLElement>("[data-fn-tool]"),
      ];
      if (nodes.length === 0) return;
      if (!widthsRef.current || widthsRef.current.length !== nodes.length) {
        widthsRef.current = nodes.map((node) => node.offsetWidth);
      }
      const count = fitToolbarItems(
        toolbar.clientWidth,
        nodes.map((node, index) => ({
          kind: node.dataset.fnTool === "sep" ? "sep" : "item",
          width: widthsRef.current![index] ?? node.offsetWidth,
        })),
        overflowWidth,
        gap
      );
      setVisibleCount(count);
    }

    measure();
    const observer = new ResizeObserver(measure);
    if (rowRef.current) observer.observe(rowRef.current);
    return () => observer.disconnect();
  }, [state.canUndo, state.canRedo]);

  const shown = visibleCount ?? tools.length;
  const overflowed = tools.slice(shown).filter((tool) => tool.kind !== "sep");
  const overflowItems: OverflowItem[] = overflowed.flatMap(
    (tool): OverflowItem[] => {
      if (tool.id === "case") {
        return [
          {
            kind: "submenu",
            id: "case",
            label: "Convert case",
            items: CASE_MODES.map((option) => ({
              id: option.mode,
              label: option.label,
              onSelect: () => applyConvertCase(editor, option.mode),
            })),
          },
        ];
      }
      if (tool.id === "ws") {
        return [
          {
            id: "ws",
            label: "Clean whitespace",
            disabled: editor.state.selection.empty,
            onSelect: () => applyCleanWhitespace(editor),
          },
        ];
      }
      if (tool.id === "chars") {
        return [
          {
            id: "chars",
            label: "Special characters",
            onSelect: () => {
              const button = rowRef.current?.querySelector<HTMLButtonElement>(
                "[data-fn-tool='chars'] button"
              );
              button?.click();
            },
          },
        ];
      }
      return [
        {
          id: tool.id,
          label: tool.overflowLabel,
          disabled: tool.disabled,
          onSelect: () => tool.onClick?.(),
        },
      ];
    }
  );

  return (
    <span ref={rowRef} className="footnote-card-toolbar" role="toolbar">
      {tools.map((tool, index) => {
        const hidden = visibleCount != null && index >= visibleCount;
        if (tool.kind === "sep") {
          return (
            <span
              key={tool.id}
              data-fn-tool="sep"
              className={`footnote-toolbar-sep${hidden ? " is-overflowed" : ""}`}
              aria-hidden
            />
          );
        }
        if (tool.kind === "slot") {
          return (
            <span
              key={tool.id}
              data-fn-tool={tool.id}
              className={`footnote-toolbar-slot${hidden ? " is-overflowed" : ""}`}
            >
              {tool.render?.()}
            </span>
          );
        }
        return (
          <span
            key={tool.id}
            data-fn-tool={tool.id}
            className={`footnote-toolbar-slot${hidden ? " is-overflowed" : ""}`}
          >
            <FootnoteToolButton
              title={tool.title}
              active={tool.active}
              disabled={tool.disabled}
              onClick={() => tool.onClick?.()}
            >
              {tool.render?.()}
            </FootnoteToolButton>
          </span>
        );
      })}
      <span
        data-fn-overflow
        className="footnote-toolbar-overflow-btn"
        hidden={overflowed.length === 0}
      >
        <EditorOverflowMenu
          menuClassName="footnote-toolbar-overflow"
          items={overflowItems}
          label="More formatting"
          buttonClassName=""
          trigger={<MoreFormattingIcon />}
        />
      </span>
    </span>
  );
}

function FootnoteToolButton({
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
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={active ? "is-active" : ""}
    >
      {children}
    </button>
  );
}

function MoreFormattingIcon() {
  return (
    <svg
      aria-hidden
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
    >
      <path
        d="M4 6.5 8 10.5 12 6.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
