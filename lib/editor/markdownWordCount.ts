import type { JSONContent } from "@tiptap/core";
import { serializeBody } from "@/lib/markdown/pipeline";
import type { DocumentStats } from "@/lib/editor/documentStats";
import { readingMinutesFromWords } from "@/lib/editor/documentStats";

/**
 * Word count from saved markdown, kept identical to personal-site's
 * `countWords` (src/lib/posts.ts) so the outline matches the site, which
 * tracks Substack's count closely (vegan-christian: site 15,415, Substack
 * 15,426; the old ProseMirror-text count read 14,939).
 *
 * Whitespace tokens after stripping markup: link URLs, images, code, HTML
 * tags/comments, and `# > * _ ~ \ | ( ) [ ] { }` go; footnote markers and
 * definition labels (`^3`), list markers, and LaTeX source stay.
 */
export function countMarkdownWords(markdown: string): number {
  const text = markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/<!--[\s\S]*?-->/g, " ")
    // Real tags only: a bare `<` (math, prose) is text, not the start of a
    // tag that swallows everything up to the next `>`.
    .replace(/<\/?[a-zA-Z][^<>]*>/g, " ")
    .replace(/[#>*_~\\|[\](){}]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return 0;
  return text.split(" ").length;
}

/** `serializeBody` puts footnote definitions (and orphans) after the body. */
const FOOTER_START_RE = /^\[\^[^\]\r\n]+\]:/m;

/** Body / footnote word counts of a serialized essay. */
export function markdownWordSplit(markdown: string): {
  words: number;
  footnoteWords: number;
} {
  const footer = FOOTER_START_RE.exec(markdown);
  const body = footer ? markdown.slice(0, footer.index) : markdown;
  const words = countMarkdownWords(body);
  return {
    words,
    footnoteWords: Math.max(0, countMarkdownWords(markdown) - words),
  };
}

/**
 * Swap ProseMirror-text word counts for the markdown count; characters,
 * paragraphs, and headings keep their document-based values.
 */
export function withMarkdownWords(
  stats: DocumentStats,
  doc: JSONContent
): DocumentStats {
  const { words, footnoteWords } = markdownWordSplit(serializeBody(doc));
  return {
    ...stats,
    words,
    readingMinutes: readingMinutesFromWords(words),
    footnotes: { ...stats.footnotes, words: footnoteWords },
  };
}
