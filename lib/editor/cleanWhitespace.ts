import type { Node as PmNode } from "@tiptap/pm/model";

/**
 * Markdown paragraph break: a blank line between blocks.
 * Shift-Enter / GFM hard line breaks extract as a single newline instead.
 */
export const PARAGRAPH_BREAK = "\n\n";
export const HARD_LINE_BREAK = "\n";

/** Two newlines is one markdown paragraph; three or more is extra blank space. */
const MARKDOWN_PARAGRAPH_NEWLINE_COUNT = 2;
const EXTRA_BLANK_LINE_NEWLINE_COUNT = MARKDOWN_PARAGRAPH_NEWLINE_COUNT + 1;

const EXTRA_BLANK_LINES_RE = new RegExp(
  `\\n(?:[ \\t]*\\n){${EXTRA_BLANK_LINE_NEWLINE_COUNT - 1},}`,
  "g"
);

export function normalizeLineEndings(text: string): string {
  return text.replace(/\r\n?/g, "\n").replace(/\u000c/g, "\n");
}

/**
 * Collapse one-or-more empty lines down to a single markdown paragraph break.
 * Soft wraps (a single newline, like Shift-Enter) are left alone.
 */
export function collapseExtraBlankLines(text: string): string {
  return normalizeLineEndings(text).replace(
    EXTRA_BLANK_LINES_RE,
    PARAGRAPH_BREAK
  );
}

/**
 * Clean PDF / paste whitespace:
 * - Shift-Enter and other single newlines become a space
 * - True paragraph breaks (blank lines) stay, and extras collapse to one
 * - Runs of spaces / tabs collapse
 */
export function cleanWhitespace(text: string): string {
  const paragraphs = collapseExtraBlankLines(text).split(PARAGRAPH_BREAK);
  const cleaned = paragraphs
    .map((paragraph) =>
      paragraph
        .replace(/[ \t]*\n[ \t]*/g, " ")
        .replace(/[ \t]+/g, " ")
        .trim()
    )
    .filter((paragraph) => paragraph.length > 0);
  return cleaned.join(PARAGRAPH_BREAK);
}

/** Leaf text so Shift-Enter hard breaks extract as a newline, not "". */
export function selectionLeafText(node: PmNode): string {
  return node.type.name === "hardBreak" ? HARD_LINE_BREAK : "";
}

/**
 * Selection as markdown-ish text: hard breaks are `\n`, block boundaries are
 * `\n\n`. Using a single `\n` for both made Convert case / Clean whitespace
 * treat paragraphs like Shift-Enter (or drop hard breaks entirely).
 */
export function selectionText(doc: PmNode, from: number, to: number): string {
  return doc.textBetween(from, to, PARAGRAPH_BREAK, selectionLeafText);
}
