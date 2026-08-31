/**
 * Lightweight writing stats from a TipTap/ProseMirror document.
 * Tuned for essay drafts: words + reading time matter most.
 */

export type DocumentStats = {
  words: number;
  characters: number;
  charactersNoSpaces: number;
  paragraphs: number;
  headings: number;
  /** Estimated silent-reading minutes at {@link READING_WPM}. */
  readingMinutes: number;
};

/** Adult silent reading average used for the estimate. */
export const READING_WPM = 220;

const WORD_RE = /[A-Za-zÀ-ÖØ-öø-ÿ0-9]+(?:['’][A-Za-zÀ-ÖØ-öø-ÿ]+)?/g;

export function countWords(text: string): number {
  if (!text) return 0;
  return text.match(WORD_RE)?.length ?? 0;
}

export function readingMinutesFromWords(words: number): number {
  if (words <= 0) return 0;
  return Math.max(1, Math.round(words / READING_WPM));
}

export type StatsNode = {
  type: { name: string };
  isText: boolean;
  text?: string;
  textContent?: string;
  attrs?: Record<string, unknown>;
  descendants: (
    f: (node: StatsNode, pos: number, parent: StatsNode | null) => boolean | void
  ) => void;
};

/**
 * Collect stats from a ProseMirror document.
 * Includes footnote body markdown (attr) in word/char counts; skips code blocks.
 */
export function collectDocumentStats(doc: StatsNode): DocumentStats {
  const parts: string[] = [];
  let paragraphs = 0;
  let headings = 0;

  doc.descendants((node) => {
    const name = node.type.name;
    if (name === "heading") {
      headings += 1;
      return;
    }
    if (name === "paragraph") {
      paragraphs += 1;
      return;
    }
    if (name === "codeBlock") return false;
    if (name === "footnoteRef") {
      const note = String(node.attrs?.content ?? "");
      if (note) parts.push(note);
      return false;
    }
    if (node.isText && node.text) {
      parts.push(node.text);
    }
    return;
  });

  const bodyText = parts.join(" ");
  const words = countWords(bodyText);

  return {
    words,
    characters: bodyText.length,
    charactersNoSpaces: bodyText.replace(/\s/g, "").length,
    paragraphs,
    headings,
    readingMinutes: readingMinutesFromWords(words),
  };
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
