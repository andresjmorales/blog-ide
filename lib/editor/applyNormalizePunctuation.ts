import type { Editor } from "@tiptap/core";
import type { Node as PmNode } from "@tiptap/pm/model";
import {
  normalizePunctuation,
  type NormalizePunctuationOptions,
} from "@/lib/editor/normalizePunctuation";

function isCodeText(node: PmNode): boolean {
  return node.marks.some((mark) => mark.type.name === "code");
}

/** Nearest text character before `pos`, skipping inline atoms. */
function charBefore(doc: PmNode, pos: number): string {
  let cursor = pos;
  while (cursor > 0) {
    const $pos = doc.resolve(cursor);
    const before = $pos.nodeBefore;
    if (!before) {
      return "";
    }
    if (before.isText && before.text) {
      return before.text[before.text.length - 1] ?? "";
    }
    if (before.isAtom) {
      cursor -= before.nodeSize;
      continue;
    }
    return "";
  }
  return "";
}

/** Nearest text character after `pos`, skipping inline atoms. */
function charAfter(doc: PmNode, pos: number): string {
  let cursor = pos;
  while (cursor < doc.content.size) {
    const $pos = doc.resolve(cursor);
    const after = $pos.nodeAfter;
    if (!after) {
      return "";
    }
    if (after.isText && after.text) {
      return after.text[0] ?? "";
    }
    if (after.isAtom) {
      cursor += after.nodeSize;
      continue;
    }
    return "";
  }
  return "";
}

/**
 * Apply punctuation normalization to **text nodes only**.
 * Inline atoms (footnotes, math, images) and their positions are preserved.
 * Skips `code` marks and `codeBlock` bodies.
 *
 * Uses adjacent text across mark boundaries so `link - clause` still
 * becomes an em/en dash (the dash lives in the unmarked text node).
 */
export function applyNormalizePunctuation(
  editor: Editor,
  options: NormalizePunctuationOptions
): boolean {
  const { state } = editor;
  const { from, to, empty } = state.selection;
  const rangeFrom = empty ? 0 : from;
  const rangeTo = empty ? state.doc.content.size : to;

  type Replacement = {
    from: number;
    to: number;
    next: string;
    marks: PmNode["marks"];
  };
  const replacements: Replacement[] = [];

  state.doc.nodesBetween(rangeFrom, rangeTo, (node, pos) => {
    if (node.type.name === "codeBlock") {
      return false;
    }
    if (!node.isText || !node.text) {
      return;
    }
    if (isCodeText(node)) {
      return;
    }

    const nodeFrom = pos;
    const nodeTo = pos + node.text.length;
    const sliceFrom = Math.max(rangeFrom, nodeFrom);
    const sliceTo = Math.min(rangeTo, nodeTo);
    if (sliceFrom >= sliceTo) {
      return;
    }

    const localFrom = sliceFrom - nodeFrom;
    const localTo = sliceTo - nodeFrom;
    const original = node.text.slice(localFrom, localTo);
    const next = normalizePunctuation(original, options, {
      before: charBefore(state.doc, sliceFrom),
      after: charAfter(state.doc, sliceTo),
    });
    if (next === original) {
      return;
    }

    replacements.push({
      from: sliceFrom,
      to: sliceTo,
      next,
      marks: node.marks,
    });
  });

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
