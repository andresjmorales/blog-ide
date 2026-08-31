import type { JSONContent } from "@tiptap/core";
import { Slice, type Schema } from "@tiptap/pm/model";
import { parseBody } from "@/lib/markdown/pipeline";
import { collapseExtraBlankLines } from "@/lib/editor/cleanWhitespace";
import { wrapUnicodeScriptsInHtml } from "@/lib/editor/unicodeScripts";
import {
  looksLikeFetchBibleHtml,
  prepareBibleQuoteHtml,
} from "@/lib/bible/quoteHtml";

export { collapseExtraBlankLines };

const PRE_PLACEHOLDER_PREFIX = "%%BLOGIDE_PRE_";
const PRE_PLACEHOLDER_SUFFIX = "%%";

function isVisuallyEmptyParagraph(el: Element): boolean {
  if (el.tagName.toLowerCase() !== "p") {
    return false;
  }
  if (el.closest("pre")) {
    return false;
  }
  const text = (el.textContent ?? "").replace(/\u00a0/g, " ").trim();
  return text.length === 0;
}

/**
 * Drop empty `<p>` / `<p><br></p>` / `&nbsp;` paragraphs so HTML paste
 * (Word, Docs, some PDFs) does not insert extra blank blocks. Adjacent
 * content paragraphs already produce one markdown paragraph break.
 */
export function normalizePastedHtml(html: string): string {
  if (typeof DOMParser === "undefined") {
    return collapseExtraBlankLines(html);
  }

  const pres: string[] = [];
  const withoutPre = html.replace(/<pre\b[\s\S]*?<\/pre>/gi, (block) => {
    const index = pres.length;
    pres.push(block);
    return `${PRE_PLACEHOLDER_PREFIX}${index}${PRE_PLACEHOLDER_SUFFIX}`;
  });

  const doc = new DOMParser().parseFromString(withoutPre, "text/html");
  for (const paragraph of [...doc.querySelectorAll("p")]) {
    if (isVisuallyEmptyParagraph(paragraph)) {
      paragraph.remove();
    }
  }

  let next = doc.body.innerHTML;
  pres.forEach((block, index) => {
    next = next.replace(
      `${PRE_PLACEHOLDER_PREFIX}${index}${PRE_PLACEHOLDER_SUFFIX}`,
      block
    );
  });
  if (looksLikeFetchBibleHtml(next)) {
    next = prepareBibleQuoteHtml(next);
  }
  return wrapUnicodeScriptsInHtml(next);
}

export function jsonFromPastedPlainText(text: string): JSONContent {
  return parseBody(collapseExtraBlankLines(text));
}

/**
 * Parse clipboard plain text as markdown after collapsing extra blank lines.
 * Default ProseMirror paste splits on every `\n`, which turns PDF wraps and
 * Shift-Enter-style lines into separate paragraphs.
 */
export function sliceFromPastedPlainText(schema: Schema, text: string): Slice {
  const json = jsonFromPastedPlainText(text);
  const node = schema.nodeFromJSON(json);
  const singleTextblock =
    node.childCount === 1 && node.firstChild?.isTextblock === true;
  const open = singleTextblock ? 1 : 0;
  return new Slice(node.content, open, open);
}
