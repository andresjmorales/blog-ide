"use client";

import type { Editor } from "@tiptap/core";
import { useEditorState } from "@tiptap/react";
import { applyCleanWhitespace } from "@/lib/editor/applyCleanWhitespace";

export function CleanWhitespaceButton({ editor }: { editor: Editor }) {
  const hasSelection = useEditorState({
    editor,
    selector: ({ editor: ed }) => !ed.state.selection.empty,
  });

  return (
    <button
      type="button"
      title="Clean whitespace (join Shift-Enter / PDF wraps; keep paragraph breaks)"
      disabled={!hasSelection}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => applyCleanWhitespace(editor)}
      className="inline-flex h-8 min-w-8 items-center justify-center rounded px-2 text-[0.7rem] font-semibold leading-none tracking-tight text-muted hover:bg-panel hover:text-foreground disabled:opacity-40"
    >
      ␣
    </button>
  );
}
