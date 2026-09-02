/**
 * Same payload as selecting the essay in the WYSIWYG and copying (Ctrl+A /
 * Ctrl+C). ProseMirror's clipboard serializer emits text/html that other
 * TipTap editors (including Substack) can paste as rich text. Copy → Markdown
 * is source only; this is the formatted sibling.
 */

import { Editor } from "@tiptap/core";
import { createExtensions } from "@/lib/editor/extensions";
import { parseBody } from "@/lib/markdown/pipeline";

export type RichTextClipboard = {
  html: string;
  plain: string;
};

export function richTextFromEditor(editor: Editor): RichTextClipboard {
  const slice = editor.state.doc.slice(0);
  const { dom, text } = editor.view.serializeForClipboard(slice);
  return {
    html: clipboardDomToHtml(dom),
    plain: text,
  };
}

/** Headless path when the WYSIWYG is not mounted (source / split). */
export function richTextFromMarkdown(markdown: string): RichTextClipboard {
  const editor = new Editor({
    extensions: createExtensions(),
    content: parseBody(markdown),
  });
  try {
    return richTextFromEditor(editor);
  } finally {
    editor.destroy();
  }
}

function clipboardDomToHtml(dom: HTMLElement): string {
  return dom.innerHTML;
}
