/**
 * Plain-text find/replace helpers for TipTap/ProseMirror documents.
 * Works on concatenated text with known absolute positions.
 */

export type FindScope = "document" | "selection" | "headings";

export type FindMatch = {
  from: number;
  to: number;
  text: string;
  /**
   * When set, `from`/`to` are offsets inside the footnoteRef `content`
   * markdown attribute, and this is the doc position of that atom.
   */
  footnotePos?: number;
};

export type FindReplaceOptions = {
  query: string;
  replacement: string;
  regex: boolean;
  caseSensitive: boolean;
  /** For replace: use JS replacement with $1, $2, etc. when regex. */
  useCaptureGroups?: boolean;
};

function buildMatcher(
  query: string,
  regex: boolean,
  caseSensitive: boolean
): RegExp | null {
  if (!query) return null;
  try {
    if (regex) {
      return new RegExp(query, caseSensitive ? "g" : "gi");
    }
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(escaped, caseSensitive ? "g" : "gi");
  } catch {
    return null;
  }
}

/**
 * Expand `$1` / `$&` style replacements using a RegExp match.
 */
export function applyReplacement(
  match: RegExpExecArray,
  replacement: string
): string {
  return replacement.replace(/\$(\d+|&|\$)/g, (token, key: string) => {
    if (key === "$") return "$";
    if (key === "&") return match[0];
    const index = Number(key);
    return match[index] ?? "";
  });
}

/**
 * Find all non-overlapping matches in `haystack`, returning offsets relative
 * to the start of haystack (add `baseFrom` for doc positions).
 */
export function findMatchesInText(
  haystack: string,
  options: Pick<FindReplaceOptions, "query" | "regex" | "caseSensitive">,
  baseFrom = 0
): FindMatch[] {
  const re = buildMatcher(options.query, options.regex, options.caseSensitive);
  if (!re) return [];

  const matches: FindMatch[] = [];
  let m: RegExpExecArray | null;
  // Guard against zero-length matches advancing forever.
  // Skip empty hits (`\d*`, `a?`, etc.) — they match every caret and explode
  // the match list; editors typically only surface non-empty matches.
  let lastIndex = 0;
  while ((m = re.exec(haystack)) !== null) {
    if (m[0].length === 0) {
      re.lastIndex = m.index + 1;
      if (re.lastIndex > haystack.length) break;
      lastIndex = re.lastIndex;
      continue;
    }
    const from = baseFrom + m.index;
    const to = from + m[0].length;
    matches.push({ from, to, text: m[0] });
    lastIndex = re.lastIndex;
  }
  return matches;
}

/**
 * Compute replacements for a haystack string (for unit tests / preview).
 * Returns the new string after replace-all.
 */
export function replaceAllInText(
  haystack: string,
  options: FindReplaceOptions
): string {
  const re = buildMatcher(options.query, options.regex, options.caseSensitive);
  if (!re) return haystack;

  if (!options.regex || options.useCaptureGroups === false) {
    // Literal-style replace via regex without capture expansion when not regex.
    if (!options.regex) {
      return haystack.replace(re, () => options.replacement);
    }
  }

  return haystack.replace(re, (...args) => {
    // Last two args are offset + string; groups are in between.
    const match = args[0] as string;
    const offset = args[args.length - 2] as number;
    const groups = args.slice(1, args.length - 2) as string[];
    const execLike = [match, ...groups] as unknown as RegExpExecArray;
    execLike.index = offset;
    execLike.input = haystack;
    return applyReplacement(execLike, options.replacement);
  });
}
