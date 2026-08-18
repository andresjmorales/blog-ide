/**
 * Docs-style smart quotes while typing in rich text.
 *
 * Straight `"` / `'` become opening quotes after whitespace, block start, or
 * opening punctuation; otherwise they become closing quotes (and apostrophes).
 * A follow-up rule turns `‘90` into `’90` (decades). Code blocks and inline
 * code are skipped by TipTap's input-rule plugin.
 */

import { Extension, InputRule } from "@tiptap/core";
import type { EditorState } from "@tiptap/pm/state";
import type { Node as PmNode } from "@tiptap/pm/model";

export const LDQ = "\u201C";
export const RDQ = "\u201D";
export const LSQ = "\u2018";
export const RSQ = "\u2019";

/** Previous characters that trigger an opening quote (Google Docs / Word). */
const OPEN_PREV = /[\s([{«–—/:;]/;

export function isOpeningQuoteContext(prev: string): boolean {
  return prev === "" || OPEN_PREV.test(prev);
}

export function curlyQuoteFor(straight: '"' | "'", prev: string): string {
  const opening = isOpeningQuoteContext(prev);
  if (straight === '"') return opening ? LDQ : RDQ;
  return opening ? LSQ : RSQ;
}

function charBefore(doc: PmNode, pos: number): string {
  if (pos <= 0) return "";
  const $pos = doc.resolve(pos);
  const before = $pos.nodeBefore;
  if (before?.isText && before.text) {
    return before.text[before.text.length - 1] ?? "";
  }
  if (before?.isAtom) {
    return "\uFFFC";
  }
  return "";
}

function skipSmartQuotes(state: EditorState, pos: number): boolean {
  const $from = state.doc.resolve(pos);
  if ($from.parent.type.spec.code) return true;
  const marks = state.storedMarks ?? $from.marks();
  return marks.some((mark) => mark.type.spec.code || mark.type.name === "code");
}

/**
 * Input rules run before the typed character is inserted. `range` is the
 * selection being replaced by that character (usually a caret).
 */
function typedQuoteRule(straight: '"' | "'"): InputRule {
  return new InputRule({
    find: straight === '"' ? /"$/ : /'$/,
    handler: ({ state, range }) => {
      if (skipSmartQuotes(state, range.from)) return null;
      const prev = charBefore(state.doc, range.from);
      state.tr.insertText(curlyQuoteFor(straight, prev), range.from, range.to);
    },
  });
}

export const SmartQuotes = Extension.create({
  name: "smartQuotes",

  addInputRules() {
    return [
      typedQuoteRule('"'),
      typedQuoteRule("'"),
      // Opening single quote + digit → apostrophe (`'90s`).
      new InputRule({
        find: /‘(\d)$/,
        handler: ({ state, range, match }) => {
          if (skipSmartQuotes(state, range.from)) return null;
          const digit = match[1];
          if (!digit) return null;
          state.tr.insertText(`${RSQ}${digit}`, range.from, range.to);
        },
      }),
    ];
  },
});
