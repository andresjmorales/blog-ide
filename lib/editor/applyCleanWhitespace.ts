import type { Editor, JSONContent } from "@tiptap/core";
import {
  cleanWhitespace,
  PARAGRAPH_BREAK,
  selectionText,
} from "@/lib/editor/cleanWhitespace";

function paragraphsFromCleanedText(text: string): JSONContent[] {
  return text.split(PARAGRAPH_BREAK).map((paragraph) => ({
    type: "paragraph",
    content: paragraph.length
      ? [{ type: "text", text: paragraph }]
      : [],
  }));
}

/**
 * Join Shift-Enter / PDF wraps to spaces while keeping real paragraph breaks.
 * Extra empty lines collapse to one markdown paragraph gap.
 */
export function applyCleanWhitespace(editor: Editor): boolean {
  const { from, to, empty } = editor.state.selection;
  if (empty) {
    return false;
  }
  const text = selectionText(editor.state.doc, from, to);
  const next = cleanWhitespace(text);
  if (next === text) {
    return false;
  }

  const chain = editor.chain().focus();
  if (!next.includes(PARAGRAPH_BREAK)) {
    chain
      .insertContentAt({ from, to }, next)
      .setTextSelection({ from, to: from + next.length });
  } else {
    chain.insertContentAt({ from, to }, paragraphsFromCleanedText(next));
  }
  return chain.run();
}
