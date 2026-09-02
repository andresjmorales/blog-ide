"use client";

import { useRef, type ReactNode } from "react";
import type { Editor } from "@tiptap/core";
import { useEditorState } from "@tiptap/react";
import { promptForLink } from "@/lib/editor/linkShortcut";
import {
  overflowSlot,
  type ToolbarItemId,
  type ToolbarLayout,
} from "@/lib/editor/toolbarLayout";
import {
  BulletListIcon,
  OrderedListIcon,
  SearchIcon,
} from "@/components/icons";
import { BoldIcon } from "@/components/tiptap-icons/bold-icon";
import { ItalicIcon } from "@/components/tiptap-icons/italic-icon";
import { StrikeIcon } from "@/components/tiptap-icons/strike-icon";
import { Code2Icon } from "@/components/tiptap-icons/code2-icon";
import { LinkIcon } from "@/components/tiptap-icons/link-icon";
import { BlockquoteIcon } from "@/components/tiptap-icons/blockquote-icon";
import { Undo2Icon } from "@/components/tiptap-icons/undo2-icon";
import { Redo2Icon } from "@/components/tiptap-icons/redo2-icon";
import { SpecialCharsMenu } from "@/components/SpecialCharsMenu";
import { CleanupToolbarButton } from "@/components/CleanupDialog";
import { FormattingOverflowMenu } from "@/components/FormattingOverflowMenu";
import { HeadingStyleMenu } from "@/components/HeadingStyleMenu";
import { ImageInsertMenu } from "@/components/ImageInsertMenu";
import { ConvertCaseMenu } from "@/components/ConvertCaseMenu";
import { useEditorPrefs } from "@/components/EditorPrefsContext";

type Props = {
  editor: Editor;
  extra?: ReactNode;
  onOpenFind: () => void;
  onOpenCitation: () => void;
  cleanupOpen: boolean;
  onOpenCleanup?: () => void;
};

export function FormattingToolbar({
  editor,
  extra,
  onOpenFind,
  onOpenCitation,
  cleanupOpen,
  onOpenCleanup,
}: Props) {
  const { prefs } = useEditorPrefs();
  const hostRef = useRef<HTMLDivElement | null>(null);
  const layout = prefs.toolbarLayout;
  const overflow = overflowSlot(layout);
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
      superscript: current.isActive("superscript"),
      subscript: current.isActive("subscript"),
      codeBlock: current.isActive("codeBlock"),
      canUndo: current.can().undo(),
      canRedo: current.can().redo(),
    }),
  });

  const handlers = {
    onOpenFind,
    onOpenCitation,
    cleanupOpen,
    onOpenCleanup,
  };

  const hiddenSlotIds = overflow
    ? overflow.items.filter((id) => needsHiddenSlot(id, handlers))
    : [];

  const groups = groupToolbarSlots(layout);

  return (
    <div
      ref={hostRef}
      className="blogide-editor-toolbar shrink-0"
      role="toolbar"
      aria-label="Formatting"
    >
      {groups.map((group, groupIndex) => (
        <div key={group.key} className="contents">
          {groupIndex > 0 ? (
            <span className="blogide-editor-toolbar-sep" aria-hidden />
          ) : null}
          <div className="blogide-editor-toolbar-group">
            {group.slots.map((slot) => {
              if (slot.type === "overflow") {
                if (slot.items.length === 0) return null;
                return (
                  <FormattingOverflowMenu
                    key="overflow"
                    editor={editor}
                    items={slot.items}
                    slotHostRef={hostRef}
                  />
                );
              }
              return (
                <ToolbarItem
                  key={slot.id}
                  id={slot.id}
                  editor={editor}
                  state={state}
                  handlers={handlers}
                />
              );
            })}
          </div>
        </div>
      ))}
      {hiddenSlotIds.map((id) => (
        <span
          key={`hidden-${id}`}
          data-toolbar-slot={id}
          className="sr-only"
          aria-hidden
        >
          <ToolbarItem
            id={id}
            editor={editor}
            state={state}
            handlers={handlers}
          />
        </span>
      ))}
      {extra ? <div className="blogide-toolbar-extra">{extra}</div> : null}
    </div>
  );
}

type ToolState = {
  bold: boolean;
  italic: boolean;
  code: boolean;
  strike: boolean;
  link: boolean;
  blockquote: boolean;
  bulletList: boolean;
  orderedList: boolean;
  superscript: boolean;
  subscript: boolean;
  codeBlock: boolean;
  canUndo: boolean;
  canRedo: boolean;
};

type ToolHandlers = {
  onOpenFind: () => void;
  onOpenCitation: () => void;
  cleanupOpen: boolean;
  onOpenCleanup?: () => void;
};

function needsHiddenSlot(id: ToolbarItemId, handlers: ToolHandlers): boolean {
  if (id === "cleanup") return Boolean(handlers.onOpenCleanup);
  return id === "chars" || id === "image" || id === "cite" || id === "find";
}

function groupToolbarSlots(layout: ToolbarLayout): Array<{
  key: string;
  slots: Exclude<ToolbarLayout[number], { type: "divider" }>[];
}> {
  const groups: Array<{
    key: string;
    slots: Exclude<ToolbarLayout[number], { type: "divider" }>[];
  }> = [];
  let current: Exclude<ToolbarLayout[number], { type: "divider" }>[] = [];
  let key = "g0";
  for (const slot of layout) {
    if (slot.type === "divider") {
      if (current.length) {
        groups.push({ key, slots: current });
        current = [];
      }
      key = slot.id;
      continue;
    }
    current.push(slot);
  }
  if (current.length) groups.push({ key, slots: current });
  return groups;
}

function ToolbarItem({
  id,
  editor,
  state,
  handlers,
}: {
  id: ToolbarItemId;
  editor: Editor;
  state: ToolState;
  handlers: ToolHandlers;
}) {
  switch (id) {
    case "undo":
      return (
        <ToolButton
          title="Undo (Ctrl+Z)"
          disabled={!state.canUndo}
          onClick={() => editor.chain().focus().undo().run()}
        >
          <Undo2Icon className="blogide-tool-icon" />
        </ToolButton>
      );
    case "redo":
      return (
        <ToolButton
          title="Redo (Ctrl+Shift+Z)"
          disabled={!state.canRedo}
          onClick={() => editor.chain().focus().redo().run()}
        >
          <Redo2Icon className="blogide-tool-icon" />
        </ToolButton>
      );
    case "heading":
      return (
        <span data-toolbar-slot="heading">
          <HeadingStyleMenu editor={editor} />
        </span>
      );
    case "bullet":
      return (
        <ToolButton
          title="Bullet list"
          active={state.bulletList}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <BulletListIcon className="blogide-tool-icon" />
        </ToolButton>
      );
    case "ordered":
      return (
        <ToolButton
          title="Ordered list"
          active={state.orderedList}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          <OrderedListIcon className="blogide-tool-icon" />
        </ToolButton>
      );
    case "bold":
      return (
        <ToolButton
          title="Bold (Ctrl+B)"
          active={state.bold}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <BoldIcon className="blogide-tool-icon" />
        </ToolButton>
      );
    case "italic":
      return (
        <ToolButton
          title="Italic (Ctrl+I)"
          active={state.italic}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <ItalicIcon className="blogide-tool-icon" />
        </ToolButton>
      );
    case "strike":
      return (
        <ToolButton
          title="Strikethrough"
          active={state.strike}
          onClick={() => editor.chain().focus().toggleStrike().run()}
        >
          <StrikeIcon className="blogide-tool-icon" />
        </ToolButton>
      );
    case "code":
      return (
        <ToolButton
          title="Inline code (Ctrl+E)"
          active={state.code}
          onClick={() => editor.chain().focus().toggleCode().run()}
        >
          <Code2Icon className="blogide-tool-icon" />
        </ToolButton>
      );
    case "blockquote":
      return (
        <ToolButton
          title="Blockquote"
          active={state.blockquote}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
        >
          <BlockquoteIcon className="blogide-tool-icon" />
        </ToolButton>
      );
    case "link":
      return (
        <ToolButton
          title="Add or edit link (Ctrl+K)"
          active={state.link}
          onClick={() => {
            void promptForLink(editor);
          }}
        >
          <LinkIcon className="blogide-tool-icon" />
        </ToolButton>
      );
    case "superscript":
      return (
        <ToolButton
          title="Superscript (Ctrl+.)"
          active={state.superscript}
          onClick={() => editor.chain().focus().toggleSuperscript().run()}
        >
          x²
        </ToolButton>
      );
    case "subscript":
      return (
        <ToolButton
          title="Subscript (Ctrl+,)"
          active={state.subscript}
          onClick={() => editor.chain().focus().toggleSubscript().run()}
        >
          x₂
        </ToolButton>
      );
    case "codeBlock":
      return (
        <ToolButton
          title="Code block"
          active={state.codeBlock}
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        >
          {"{ }"}
        </ToolButton>
      );
    case "case":
      return (
        <span data-toolbar-slot="case">
          <ConvertCaseMenu editor={editor} />
        </span>
      );
    case "chars":
      return (
        <span data-toolbar-slot="chars">
          <SpecialCharsMenu editor={editor} />
        </span>
      );
    case "image":
      return (
        <span data-toolbar-slot="image">
          <ImageInsertMenu editor={editor} />
        </span>
      );
    case "hr":
      return (
        <ToolButton
          title="Divider (horizontal rule)"
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
        >
          Div
        </ToolButton>
      );
    case "table":
      return (
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
      );
    case "tex":
      return (
        <ToolButton
          title="Insert inline math"
          onClick={() => editor.chain().focus().insertInlineMath("x").run()}
        >
          TeX
        </ToolButton>
      );
    case "footnote":
      return (
        <ToolButton
          title="Insert footnote (Ctrl+Shift+F)"
          onClick={() => editor.chain().focus().insertFootnote().run()}
        >
          Footnote
        </ToolButton>
      );
    case "cite":
      return (
        <span data-toolbar-slot="cite">
          <ToolButton title="Insert citation from BibTeX" onClick={handlers.onOpenCitation}>
            Cite
          </ToolButton>
        </span>
      );
    case "find":
      return (
        <span data-toolbar-slot="find">
          <ToolButton title="Find (Ctrl+F)" onClick={handlers.onOpenFind}>
            <SearchIcon className="blogide-tool-icon" />
          </ToolButton>
        </span>
      );
    case "cleanup":
      if (!handlers.onOpenCleanup) return null;
      return (
        <span data-toolbar-slot="cleanup">
          <CleanupToolbarButton
            open={handlers.cleanupOpen}
            onOpen={handlers.onOpenCleanup}
          />
        </span>
      );
    default:
      return null;
  }
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
  children: ReactNode;
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
