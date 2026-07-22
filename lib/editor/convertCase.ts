export type CaseMode =
  | "sentence"
  | "upper"
  | "lower"
  | "title"
  | "capitalized";

/** Small words left lowercase in Title Case (except first/last). */
const TITLE_SMALL = new Set([
  "a",
  "an",
  "and",
  "as",
  "at",
  "but",
  "by",
  "for",
  "from",
  "in",
  "into",
  "nor",
  "of",
  "on",
  "or",
  "per",
  "the",
  "to",
  "vs",
  "via",
  "with",
]);

function capitalizeWord(word: string): string {
  if (!word) return word;
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

/** Preserve leading/trailing whitespace; transform the inner text. */
export function convertCase(text: string, mode: CaseMode): string {
  const match = text.match(/^(\s*)([\s\S]*?)(\s*)$/);
  if (!match) return text;
  const [, lead, body, trail] = match;
  if (!body) return text;

  let next: string;
  switch (mode) {
    case "upper":
      next = body.toUpperCase();
      break;
    case "lower":
      next = body.toLowerCase();
      break;
    case "sentence": {
      const lower = body.toLowerCase();
      const idx = lower.search(/\S/);
      next =
        idx < 0
          ? lower
          : lower.slice(0, idx) +
            lower.charAt(idx).toUpperCase() +
            lower.slice(idx + 1);
      break;
    }
    case "capitalized":
      next = body
        .split(/(\s+)/)
        .map((part) => (/^\s+$/.test(part) ? part : capitalizeWord(part)))
        .join("");
      break;
    case "title": {
      const parts = body.split(/(\s+)/);
      const words = parts.filter((p) => !/^\s+$/.test(p));
      let wordIndex = 0;
      next = parts
        .map((part) => {
          if (/^\s+$/.test(part)) return part;
          const isFirst = wordIndex === 0;
          const isLast = wordIndex === words.length - 1;
          wordIndex += 1;
          const lower = part.toLowerCase();
          if (!isFirst && !isLast && TITLE_SMALL.has(lower)) return lower;
          return capitalizeWord(part);
        })
        .join("");
      break;
    }
    default:
      next = body;
  }

  return `${lead}${next}${trail}`;
}
