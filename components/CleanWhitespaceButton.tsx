"use client";

import type { Editor } from "@tiptap/core";
import { useEditorState } from "@tiptap/react";
import { cleanWhitespace } from "@/lib/editor/cleanWhitespace";

function applyCleanWhitespace(editor: Editor) {
  const { from, to, empty } = editor.state.selection;
  if (empty) return;
  const text = editor.state.doc.textBetween(from, to, "\n");
  const next = cleanWhitespace(text);
  if (next === text) return;
  editor
    .chain()
    .focus()
    .insertContentAt({ from, to }, next)
    .setTextSelection({ from, to: from + next.length })
    .run();
}

export function CleanWhitespaceButton({ editor }: { editor: Editor }) {
  const hasSelection = useEditorState({
    editor,
    selector: ({ editor: ed }) => !ed.state.selection.empty,
  });

  return (
    <button
      type="button"
      title="Clean whitespace (collapse newlines from PDF paste)"
      disabled={!hasSelection}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => applyCleanWhitespace(editor)}
      className="inline-flex h-8 min-w-8 items-center justify-center rounded px-2 text-[0.7rem] font-semibold leading-none tracking-tight text-muted hover:bg-panel hover:text-foreground disabled:opacity-40"
    >
      ␣
    </button>
  );
}
