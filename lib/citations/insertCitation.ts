import type { Editor } from "@tiptap/core";
import type { CiteStyleId } from "@/lib/citations/citeStyle";
import { formattedKeyForStyle } from "@/lib/citations/citeStyle";
import {
  mergeEssayCitation,
  type EssayCitation,
  type EssayCitationFormatted,
} from "@/lib/markdown/essayCitations";
import { createFootnoteId } from "@/lib/editor/footnote";
import { queueFootnoteEditorOpen } from "@/lib/editor/footnoteOpen";
import { scrollHeadingIntoView } from "@/lib/editor/editorScroll";

export function readEssayCitations(editor: Editor): EssayCitation[] {
  const raw = editor.state.doc.attrs.essayCitations;
  return Array.isArray(raw) ? (raw as EssayCitation[]) : [];
}

export function writeEssayCitations(
  editor: Editor,
  citations: EssayCitation[]
): void {
  if (editor.isDestroyed) return;
  editor.view.dispatch(
    editor.state.tr.setDocAttribute("essayCitations", citations)
  );
}

export function formattedField(
  text: string,
  style: CiteStyleId
): EssayCitationFormatted {
  return { [formattedKeyForStyle(style)]: text };
}

export function insertCitationFootnote(
  editor: Editor,
  citation: EssayCitation,
  text: string
): string {
  const footnoteId = createFootnoteId();
  const type = editor.schema.nodes.footnoteRef;
  const node = type.create({ id: footnoteId, content: text });
  const next = mergeEssayCitation(readEssayCitations(editor), {
    ...citation,
    footnoteIds: [footnoteId],
  });
  queueFootnoteEditorOpen(footnoteId);
  const tr = editor.state.tr
    .replaceSelectionWith(node)
    .setDocAttribute("essayCitations", next)
    .scrollIntoView();
  editor.view.dispatch(tr);
  editor.commands.focus();
  return footnoteId;
}

export function insertCitationAtCaret(
  editor: Editor,
  citation: EssayCitation,
  text: string
): void {
  const next = mergeEssayCitation(readEssayCitations(editor), citation);
  editor.chain().focus().insertContent(text).run();
  writeEssayCitations(editor, next);
}

export function updateCitationSnapshot(
  editor: Editor,
  citation: EssayCitation
): void {
  writeEssayCitations(
    editor,
    mergeEssayCitation(readEssayCitations(editor), citation)
  );
}

export function rewriteFootnoteContent(
  editor: Editor,
  footnoteId: string,
  content: string
): boolean {
  let pos: number | null = null;
  editor.state.doc.descendants((node, nodePos) => {
    if (node.type.name === "footnoteRef" && node.attrs.id === footnoteId) {
      pos = nodePos;
      return false;
    }
    return true;
  });
  if (pos == null) return false;
  const node = editor.state.doc.nodeAt(pos);
  if (!node) return false;
  editor.view.dispatch(
    editor.state.tr.setNodeMarkup(pos, undefined, {
      ...node.attrs,
      content,
    })
  );
  return true;
}

export function scrollFootnoteIntoView(editor: Editor, pos: number): void {
  const inner = Math.min(pos + 1, editor.state.doc.content.size);
  editor
    .chain()
    .setTextSelection(inner)
    .focus(null, { scrollIntoView: false })
    .run();
  scrollHeadingIntoView(editor, pos);
}
