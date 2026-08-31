"use client";

import type { Editor } from "@tiptap/core";
import { useEditorState } from "@tiptap/react";
import { applyConvertCase } from "@/lib/editor/applyConvertCase";
import {
  EditorOverflowMenu,
  type OverflowItem,
} from "@/components/EditorOverflowMenu";
import { CONVERT_CASE_OPTIONS } from "@/components/ConvertCaseMenu";
import { FormattingAaIcon } from "@/components/icons";

type Props = {
  editor: Editor;
  /** Match the host toolbar button chrome. */
  buttonClassName?: string;
};

export function FormattingOverflowMenu({ editor, buttonClassName }: Props) {
  const state = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      superscript: current.isActive("superscript"),
      subscript: current.isActive("subscript"),
      codeBlock: current.isActive("codeBlock"),
    }),
  });

  const markActive = state.superscript || state.subscript || state.codeBlock;

  const items: OverflowItem[] = [
    {
      id: "superscript",
      label: "Superscript",
      onSelect: () => editor.chain().focus().toggleSuperscript().run(),
    },
    {
      id: "subscript",
      label: "Subscript",
      onSelect: () => editor.chain().focus().toggleSubscript().run(),
    },
    {
      id: "codeBlock",
      label: "Code block",
      onSelect: () => editor.chain().focus().toggleCodeBlock().run(),
    },
    { kind: "separator", id: "sep-case" },
    {
      kind: "submenu",
      id: "case",
      label: "Convert case",
      items: CONVERT_CASE_OPTIONS.map((option) => ({
        id: option.mode,
        label: option.label,
        onSelect: () => applyConvertCase(editor, option.mode),
      })),
    },
  ];

  return (
    <EditorOverflowMenu
      menuClassName="formatting-overflow-menu"
      items={items}
      label="More formatting"
      buttonClassName={[
        buttonClassName ??
          "inline-flex h-8 min-w-8 items-center justify-center rounded px-2 text-muted hover:bg-panel hover:text-foreground",
        markActive ? "is-active bg-accent/15 text-accent" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      trigger={<FormattingAaIcon className="blogide-tool-icon" />}
    />
  );
}
