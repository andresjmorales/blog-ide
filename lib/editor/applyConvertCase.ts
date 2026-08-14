import type { Editor } from "@tiptap/core";
import type { Node as PmNode } from "@tiptap/pm/model";
import { convertCase, type CaseMode } from "@/lib/editor/convertCase";
import {
  HARD_LINE_BREAK,
  PARAGRAPH_BREAK,
} from "@/lib/editor/cleanWhitespace";

export type { CaseMode };

type Piece =
  | { kind: "sep"; length: number }
  | {
      kind: "text";
      from: number;
      to: number;
      original: string;
      marks: PmNode["marks"];
      convert: boolean;
    };

function isCodeText(node: PmNode): boolean {
  return node.marks.some((mark) => mark.type.name === "code");
}

/**
 * Convert case in the selection without flattening Shift-Enter hard breaks,
 * paragraph breaks, or marks. `insertContentAt` with `textBetween(..., "\\n")`
 * dropped hard-break nodes (leaf text is "") and glued words together.
 */
export function applyConvertCase(editor: Editor, mode: CaseMode): boolean {
  const { state } = editor;
  const { from, to, empty } = state.selection;
  if (empty) {
    return false;
  }

  const pieces: Piece[] = [];
  let built = "";
  let seenTextblock = false;

  state.doc.nodesBetween(from, to, (node, pos) => {
    if (node.type.name === "codeBlock") {
      return false;
    }
    if (node.isTextblock) {
      if (seenTextblock) {
        built += PARAGRAPH_BREAK;
        pieces.push({ kind: "sep", length: PARAGRAPH_BREAK.length });
      }
      seenTextblock = true;
    }
    if (node.type.name === "hardBreak") {
      built += HARD_LINE_BREAK;
      pieces.push({ kind: "sep", length: HARD_LINE_BREAK.length });
      return;
    }
    if (!node.isText || !node.text) {
      return;
    }

    const nodeFrom = pos;
    const nodeTo = pos + node.text.length;
    const sliceFrom = Math.max(from, nodeFrom);
    const sliceTo = Math.min(to, nodeTo);
    if (sliceFrom >= sliceTo) {
      return;
    }

    const original = node.text.slice(sliceFrom - nodeFrom, sliceTo - nodeFrom);
    built += original;
    pieces.push({
      kind: "text",
      from: sliceFrom,
      to: sliceTo,
      original,
      marks: node.marks,
      convert: !isCodeText(node),
    });
  });

  if (!built) {
    return false;
  }

  const converted = convertCase(built, mode);
  if (converted === built) {
    return false;
  }

  const lengthOk = converted.length === built.length;
  let cursor = 0;
  const replacements: {
    from: number;
    to: number;
    next: string;
    marks: PmNode["marks"];
  }[] = [];

  for (const piece of pieces) {
    if (piece.kind === "sep") {
      cursor += piece.length;
      continue;
    }
    let next = piece.original;
    if (piece.convert) {
      next = lengthOk
        ? converted.slice(cursor, cursor + piece.original.length)
        : convertCase(piece.original, mode);
    }
    cursor += piece.original.length;
    if (next !== piece.original) {
      replacements.push({
        from: piece.from,
        to: piece.to,
        next,
        marks: piece.marks,
      });
    }
  }

  if (replacements.length === 0) {
    return false;
  }

  let tr = state.tr;
  for (let i = replacements.length - 1; i >= 0; i--) {
    const item = replacements[i];
    tr = tr.replaceWith(
      item.from,
      item.to,
      state.schema.text(item.next, item.marks)
    );
  }
  if (!tr.docChanged) {
    return false;
  }
  editor.view.dispatch(tr);
  return true;
}
