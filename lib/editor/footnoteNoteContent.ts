import { MarkdownManager } from "@tiptap/markdown";
import type { JSONContent } from "@tiptap/core";
import { Slice, type Schema } from "@tiptap/pm/model";
import { createFootnoteExtensions } from "@/lib/editor/footnoteSchema";
import { collapseExtraBlankLines } from "@/lib/editor/cleanWhitespace";
import { normalizeLatexDelimiters, prepareMath } from "@/lib/editor/math";
import { convertPastedMathHtml } from "@/lib/editor/mathPaste";

/**
 * Footnote bodies are stored as markdown with plain `$…$` / `$$…$$` math.
 * The nested editor parses markdown directly (no essay pipeline), so fold
 * the delimiters into the math sentinels its tokenizers understand first.
 */
export function prepareFootnoteMarkdown(markdown: string): string {
  if (!markdown.includes("$")) return markdown;
  return prepareMath(markdown);
}

let manager: MarkdownManager | null = null;

function getManager(): MarkdownManager {
  if (!manager) {
    manager = new MarkdownManager({ extensions: createFootnoteExtensions() });
  }
  return manager;
}

/** Footnote markdown → JSON for the nested note schema (math included). */
export function parseFootnoteMarkdown(markdown: string): JSONContent {
  return getManager().parse(prepareFootnoteMarkdown(markdown));
}

const MATH_HINT_RE = /\$|\\\(|\\\[/;

/**
 * Plain-text paste into a footnote: `$x^2$` / `\(…\)` become math nodes like
 * they do in the essay. Null (default paste) when there is no math to fold.
 */
export function sliceFromFootnotePlainText(
  schema: Schema,
  text: string
): Slice | null {
  if (!MATH_HINT_RE.test(text)) return null;
  const prepared = prepareMath(
    normalizeLatexDelimiters(collapseExtraBlankLines(text))
  );
  if (!prepared.includes("[[blogide-math-")) return null;
  const json = getManager().parse(prepared);
  const node = schema.nodeFromJSON(json);
  const singleTextblock =
    node.childCount === 1 && node.firstChild?.isTextblock === true;
  const open = singleTextblock ? 1 : 0;
  return new Slice(node.content, open, open);
}

/**
 * Pasted HTML for a footnote body: rendered / delimited math → math nodes,
 * and no nested footnote references (a note can't hold another note).
 */
export function transformFootnotePastedHtml(html: string): string {
  if (typeof DOMParser === "undefined") return html;
  let next = html;
  if (next.includes("data-footnote-ref")) {
    const doc = new DOMParser().parseFromString(next, "text/html");
    doc.querySelectorAll("sup[data-footnote-ref]").forEach((el) => el.remove());
    next = doc.body.innerHTML;
  }
  return convertPastedMathHtml(next);
}
