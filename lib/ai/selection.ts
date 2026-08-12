import type { Editor } from "@tiptap/core";
import type { JSONContent } from "@tiptap/core";
import { parseBody, serializeBody } from "@/lib/markdown/pipeline";

export type AiSelection = {
  /** Markdown (or plain) text for the current selection. */
  text: string;
  /** ProseMirror positions when in WYSIWYG; source offsets in markdown modes. */
  from: number;
  to: number;
  mode: "wysiwyg" | "source";
};

/**
 * Serialize the current WYSIWYG selection to markdown when possible.
 * Falls back to plain textBetween for awkward open slices.
 */
export function getWysiwygSelection(editor: Editor): AiSelection | null {
  const { from, to, empty } = editor.state.selection;
  if (empty || from === to) return null;

  try {
    const slice = editor.state.doc.slice(from, to);
    const content = slice.content.toJSON() as JSONContent | JSONContent[];
    const nodes = Array.isArray(content) ? content : content ? [content] : [];
    if (nodes.length > 0) {
      const doc: JSONContent = { type: "doc", content: nodes };
      const md = serializeBody(doc).trim();
      if (md) {
        return { text: md, from, to, mode: "wysiwyg" };
      }
    }
  } catch {
    // fall through
  }

  const text = editor.state.doc.textBetween(from, to, "\n\n").trim();
  if (!text) return null;
  return { text, from, to, mode: "wysiwyg" };
}

export function getSourceSelection(
  value: string,
  from: number,
  to: number
): AiSelection | null {
  if (from === to || from < 0 || to > value.length || from > to) return null;
  const text = value.slice(from, to);
  if (!text.trim()) return null;
  return { text, from, to, mode: "source" };
}

/** Replace a stored WYSIWYG range with markdown content. */
export function replaceWysiwygRange(
  editor: Editor,
  from: number,
  to: number,
  markdown: string
): boolean {
  const size = editor.state.doc.content.size;
  if (from < 0 || to > size || from > to) return false;
  try {
    const doc = parseBody(markdown);
    const content = doc.content ?? [];
    return editor
      .chain()
      .focus()
      .insertContentAt({ from, to }, content)
      .run();
  } catch {
    return editor
      .chain()
      .focus()
      .insertContentAt({ from, to }, markdown)
      .run();
  }
}

/** Replace a source-string range; returns the next full markdown. */
export function replaceSourceRange(
  source: string,
  from: number,
  to: number,
  replacement: string
): string | null {
  if (from < 0 || to > source.length || from > to) return null;
  return source.slice(0, from) + replacement + source.slice(to);
}
