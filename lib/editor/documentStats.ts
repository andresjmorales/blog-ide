/**
 * Lightweight writing stats from a TipTap/ProseMirror document.
 * Tuned for essay drafts: words + reading time matter most.
 */

export type TextStats = {
  words: number;
  characters: number;
  charactersNoSpaces: number;
};

export type DocumentStats = TextStats & {
  paragraphs: number;
  headings: number;
  /** Estimated silent-reading minutes at {@link READING_WPM}. */
  readingMinutes: number;
  /** Footnote bodies, counted separately so the outline can toggle them. */
  footnotes: TextStats;
};

/** Adult silent reading average used for the estimate. */
export const READING_WPM = 220;

/** A token counts as a word once it has at least one letter or digit. */
const WORDISH_RE = /[\p{L}\p{N}]/u;

/**
 * Whitespace-delimited word count, the way Substack, Word, and most static
 * site "reading time" helpers count: `well-known`, `word—word`, `14,000`,
 * `and/or`, and URLs are one word each. Bare punctuation (a spaced `—`,
 * `&`, `*`) is not a word.
 */
export function countWords(text: string): number {
  if (!text) return 0;
  let words = 0;
  for (const token of text.split(/\s+/)) {
    if (token && WORDISH_RE.test(token)) words += 1;
  }
  return words;
}

export function readingMinutesFromWords(words: number): number {
  if (words <= 0) return 0;
  return Math.max(1, Math.round(words / READING_WPM));
}

/**
 * Footnote bodies are stored as markdown. Reduce to the prose a reader sees:
 * link/image URLs, autolinks, and inline math source are not words.
 */
export function footnotePlainText(markdown: string): string {
  if (!markdown) return "";
  return (
    markdown
      // ![alt](url) → alt ; [text](url "title") → text
      .replace(/!?\[([^\]]*)\]\((?:[^()]|\([^()]*\))*\)/g, "$1")
      // [text][ref] → text
      .replace(/\[([^\]]*)\]\[[^\]]*\]/g, "$1")
      // <https://…> autolinks
      .replace(/<(?:https?:|mailto:)[^>\s]*>/gi, " ")
      // $…$ / $$…$$ math source
      .replace(/\$\$[\s\S]*?\$\$|\$[^$\n]+\$/g, " ")
      // Emphasis / code / strike markers
      .replace(/[*_~`]+/g, "")
  );
}

export type StatsNode = {
  type: { name: string };
  isText: boolean;
  /** ProseMirror getter; absent on test doubles (treated as block). */
  isInline?: boolean;
  text?: string;
  textContent?: string;
  attrs?: Record<string, unknown>;
  descendants: (
    f: (node: StatsNode, pos: number, parent: StatsNode | null) => boolean | void
  ) => void;
};

function textStats(text: string): TextStats {
  return {
    words: countWords(text),
    characters: text.length,
    charactersNoSpaces: text.replace(/\s/g, "").length,
  };
}

/**
 * Collect stats from a ProseMirror document.
 * Footnote bodies are counted into `footnotes`; code blocks are skipped.
 */
export function collectDocumentStats(doc: StatsNode): DocumentStats {
  // Adjacent text nodes inside one textblock are contiguous prose (marks split
  // them mid-word: `**un**likely`), so join them with nothing. Blocks and
  // line breaks are the only separators.
  let body = "";
  const notes: string[] = [];
  let paragraphs = 0;
  let headings = 0;

  doc.descendants((node) => {
    if (node.isText) {
      if (node.text) body += node.text;
      return;
    }
    const name = node.type.name;
    if (name === "codeBlock") {
      body += "\n";
      return false;
    }
    if (name === "footnoteRef") {
      const note = footnotePlainText(String(node.attrs?.content ?? ""));
      if (note.trim()) notes.push(note);
      return false;
    }
    if (name === "heading") headings += 1;
    else if (name === "paragraph") paragraphs += 1;
    // Block boundaries and hard breaks separate words; other inline atoms
    // (inline math) are not prose and leave the surrounding text as is.
    if (node.isInline !== true || name === "hardBreak") body += "\n";
    return;
  });

  const bodyText = body.replace(/\n+/g, "\n").trim();
  const bodyStats = textStats(bodyText);

  return {
    ...bodyStats,
    paragraphs,
    headings,
    readingMinutes: readingMinutesFromWords(bodyStats.words),
    footnotes: textStats(notes.join("\n")),
  };
}

/** Fold footnote counts into the body totals (outline "Count footnotes"). */
export function withFootnotes(
  stats: DocumentStats,
  includeFootnotes: boolean
): DocumentStats {
  if (!includeFootnotes) return stats;
  const words = stats.words + stats.footnotes.words;
  return {
    ...stats,
    words,
    characters: stats.characters + stats.footnotes.characters,
    charactersNoSpaces:
      stats.charactersNoSpaces + stats.footnotes.charactersNoSpaces,
    readingMinutes: readingMinutesFromWords(words),
  };
}

export type StatsDoc = StatsNode & {
  slice: (from: number, to: number) => { content: Pick<StatsNode, "descendants"> };
};

/** Stats for a document range (the outline's "Selection" readout). */
export function collectRangeStats(
  doc: StatsDoc,
  from: number,
  to: number
): DocumentStats {
  const { content } = doc.slice(from, to);
  return collectDocumentStats({
    type: { name: "doc" },
    isText: false,
    descendants: (f) => content.descendants(f),
  });
}

/** Format reading time for the outline footer. */
export function formatReadingTime(minutes: number, words: number): string {
  if (words <= 0) return "0 min read";
  if (minutes <= 1) return "1 min read";
  return `${minutes} min read`;
}

/** Compact word label, e.g. "1,234 words". */
export function formatWordCount(words: number): string {
  const formatted = words.toLocaleString("en-US");
  return words === 1 ? "1 word" : `${formatted} words`;
}
