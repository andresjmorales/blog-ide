"use client";

import type { RefObject } from "react";
import type { Editor } from "@tiptap/core";
import { useEditorState } from "@tiptap/react";
import { applyConvertCase } from "@/lib/editor/applyConvertCase";
import {
  defaultOverflowItems,
  TOOLBAR_ITEM_LABELS,
  type ToolbarItemId,
} from "@/lib/editor/toolbarLayout";
import {
  EditorOverflowMenu,
  type OverflowItem,
} from "@/components/EditorOverflowMenu";
import { CONVERT_CASE_OPTIONS } from "@/components/ConvertCaseMenu";
import { FormattingAaIcon } from "@/components/icons";
import { promptForLink } from "@/lib/editor/linkShortcut";

type Props = {
  editor: Editor;
  /** Match the host toolbar button chrome. */
  buttonClassName?: string;
  /** Items shown inside Aa+. Defaults to the built-in extra-formatting set. */
  items?: ToolbarItemId[];
  /** Hidden slot buttons the menu can click (heading, Ω, image, case). */
  slotHostRef?: RefObject<HTMLElement | null>;
};

const ACTIVE_MARKS = new Set<ToolbarItemId>([
  "bold",
  "italic",
  "strike",
  "code",
  "blockquote",
  "link",
  "superscript",
  "subscript",
  "codeBlock",
  "bullet",
  "ordered",
]);

export function FormattingOverflowMenu({
  editor,
  buttonClassName,
  items,
  slotHostRef,
}: Props) {
  const ids = items ?? defaultOverflowItems();
  const state = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      bold: current.isActive("bold"),
      italic: current.isActive("italic"),
      strike: current.isActive("strike"),
      code: current.isActive("code"),
      blockquote: current.isActive("blockquote"),
      link: current.isActive("link"),
      superscript: current.isActive("superscript"),
      subscript: current.isActive("subscript"),
      codeBlock: current.isActive("codeBlock"),
      bullet: current.isActive("bulletList"),
      ordered: current.isActive("orderedList"),
    }),
  });

  const markActive = ids.some((id) => {
    if (!ACTIVE_MARKS.has(id)) return false;
    if (id === "bullet") return state.bullet;
    if (id === "ordered") return state.ordered;
    return Boolean(state[id as keyof typeof state]);
  });

  const overflowItems: OverflowItem[] = ids.flatMap((id) =>
    overflowItemsFor(id, editor, slotHostRef)
  );

  return (
    <EditorOverflowMenu
      menuClassName="formatting-overflow-menu"
      items={overflowItems}
      label="More formatting"
      buttonClassName={[
        buttonClassName ??
          "inline-flex h-8 min-w-8 items-center justify-center rounded px-2 text-muted hover:bg-panel hover:text-foreground",
        markActive ? "is-active bg-accent/15 text-accent" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      trigger={<FormattingAaIcon />}
    />
  );
}

function clickSlot(
  slotHostRef: RefObject<HTMLElement | null> | undefined,
  id: string
) {
  slotHostRef?.current
    ?.querySelector<HTMLButtonElement>(`[data-toolbar-slot='${id}'] button`)
    ?.click();
}

function overflowItemsFor(
  id: ToolbarItemId,
  editor: Editor,
  slotHostRef?: RefObject<HTMLElement | null>
): OverflowItem[] {
  switch (id) {
    case "heading":
      return [
        {
          kind: "submenu",
          id: "heading",
          label: TOOLBAR_ITEM_LABELS.heading,
          items: [
            {
              id: "paragraph",
              label: "Paragraph",
              onSelect: () => editor.chain().focus().setParagraph().run(),
            },
            ...([1, 2, 3, 4] as const).map((level) => ({
              id: `heading-${level}`,
              label: `Heading ${level}`,
              onSelect: () =>
                editor.chain().focus().setHeading({ level }).run(),
            })),
          ],
        },
      ];
    case "case":
      return [
        {
          kind: "submenu",
          id: "case",
          label: TOOLBAR_ITEM_LABELS.case,
          items: CONVERT_CASE_OPTIONS.map((option) => ({
            id: option.mode,
            label: option.label,
            onSelect: () => applyConvertCase(editor, option.mode),
          })),
        },
      ];
    case "chars":
    case "image":
      return [
        {
          id,
          label: TOOLBAR_ITEM_LABELS[id],
          onSelect: () => clickSlot(slotHostRef, id),
        },
      ];
    case "superscript":
      return [
        {
          id,
          label: TOOLBAR_ITEM_LABELS[id],
          onSelect: () => editor.chain().focus().toggleSuperscript().run(),
        },
      ];
    case "subscript":
      return [
        {
          id,
          label: TOOLBAR_ITEM_LABELS[id],
          onSelect: () => editor.chain().focus().toggleSubscript().run(),
        },
      ];
    case "codeBlock":
      return [
        {
          id,
          label: TOOLBAR_ITEM_LABELS[id],
          onSelect: () => editor.chain().focus().toggleCodeBlock().run(),
        },
      ];
    case "code":
      return [
        {
          id,
          label: TOOLBAR_ITEM_LABELS[id],
          onSelect: () => editor.chain().focus().toggleCode().run(),
        },
      ];
    case "bold":
      return [
        {
          id,
          label: TOOLBAR_ITEM_LABELS[id],
          onSelect: () => editor.chain().focus().toggleBold().run(),
        },
      ];
    case "italic":
      return [
        {
          id,
          label: TOOLBAR_ITEM_LABELS[id],
          onSelect: () => editor.chain().focus().toggleItalic().run(),
        },
      ];
    case "strike":
      return [
        {
          id,
          label: TOOLBAR_ITEM_LABELS[id],
          onSelect: () => editor.chain().focus().toggleStrike().run(),
        },
      ];
    case "blockquote":
      return [
        {
          id,
          label: TOOLBAR_ITEM_LABELS[id],
          onSelect: () => editor.chain().focus().toggleBlockquote().run(),
        },
      ];
    case "bullet":
      return [
        {
          id,
          label: TOOLBAR_ITEM_LABELS[id],
          onSelect: () => editor.chain().focus().toggleBulletList().run(),
        },
      ];
    case "ordered":
      return [
        {
          id,
          label: TOOLBAR_ITEM_LABELS[id],
          onSelect: () => editor.chain().focus().toggleOrderedList().run(),
        },
      ];
    case "link":
      return [
        {
          id,
          label: TOOLBAR_ITEM_LABELS[id],
          onSelect: () => {
            void promptForLink(editor);
          },
        },
      ];
    case "undo":
      return [
        {
          id,
          label: TOOLBAR_ITEM_LABELS[id],
          disabled: !editor.can().undo(),
          onSelect: () => editor.chain().focus().undo().run(),
        },
      ];
    case "redo":
      return [
        {
          id,
          label: TOOLBAR_ITEM_LABELS[id],
          disabled: !editor.can().redo(),
          onSelect: () => editor.chain().focus().redo().run(),
        },
      ];
    case "hr":
      return [
        {
          id,
          label: TOOLBAR_ITEM_LABELS[id],
          onSelect: () => editor.chain().focus().setHorizontalRule().run(),
        },
      ];
    case "table":
      return [
        {
          id,
          label: TOOLBAR_ITEM_LABELS[id],
          onSelect: () =>
            editor
              .chain()
              .focus()
              .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
              .run(),
        },
      ];
    case "tex":
      return [
        {
          id,
          label: TOOLBAR_ITEM_LABELS[id],
          onSelect: () => editor.chain().focus().insertInlineMath("x").run(),
        },
      ];
    case "footnote":
      return [
        {
          id,
          label: TOOLBAR_ITEM_LABELS[id],
          onSelect: () => editor.chain().focus().insertFootnote().run(),
        },
      ];
    case "cite":
    case "find":
    case "cleanup":
      return [
        {
          id,
          label: TOOLBAR_ITEM_LABELS[id],
          onSelect: () => clickSlot(slotHostRef, id),
        },
      ];
    default:
      return [];
  }
}
