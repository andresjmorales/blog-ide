/**
 * Programmatic punctuation / dash / quote normalization for essay text.
 * Operates on plain strings (selection or doc textBetween).
 *
 * Pause dashes are intentionally strict: only ` - ` / ` – ` (spaces required
 * on both sides). Compound hyphens (`good-faith`) and tight en dashes
 * (`military–industrial`, `12–14`) are left alone.
 */

export type DashStyle = "chicago" | "mla";

export type NormalizePunctuationOptions = {
  dashStyle: DashStyle;
  /** Straight → curly quotes. Default true. */
  smartQuotes?: boolean;
  /**
   * Convert spaced pause dashes (` - ` / ` – `). Default true.
   * Set false for smart-quotes-only passes.
   */
  pauseDashes?: boolean;
  /**
   * `12-14` → `12–14`. Default false — leave range hyphens alone unless
   * the author opts in (pause-dash rules never touch unspaced hyphens).
   */
  digitRanges?: boolean;
  /** Capitalize letter after `.?!` + space. Default false. */
  sentenceCase?: boolean;
};

const EM = "\u2014"; // —
const EN = "\u2013"; // –
const LDQ = "\u201C"; // “
const RDQ = "\u201D"; // ”
const LSQ = "\u2018"; // ‘
const RSQ = "\u2019"; // ’

/**
 * Parenthetical / pause dash: required spaces on both sides.
 * Hyphen, en, em, or ASCII double/triple hyphen.
 */
const PAUSE_DASH_RE = / (?:---|--|—|–|-) /g;

/** Digit range with hyphen or en (optional spaces). Opt-in only. */
const DIGIT_RANGE_RE = /(\d)[ \t]*[-–][ \t]*(\d)/g;

/** Leading ` - ` when the prior char is in another text node (e.g. after a link). */
const LEADING_PAUSE_DASH_RE = /^ (?:---|--|—|–|-) /;

/** Trailing ` - ` when the next char is in another text node. */
const TRAILING_PAUSE_DASH_RE = / (?:---|--|—|–|-) $/;

function pauseReplacement(style: DashStyle): string {
  return style === "chicago" ? EM : ` ${EN} `;
}

function isDigitDigitSpan(left: string, right: string): boolean {
  return /\d/.test(left) && /\d/.test(right);
}

function applyDashStyle(text: string, style: DashStyle): string {
  return text.replace(PAUSE_DASH_RE, (match, offset: number) => {
    const left = text[offset - 1] ?? "";
    const right = text[offset + match.length] ?? "";
    // Spaced digit ranges like `15 - 16` are not parenthetical asides.
    if (isDigitDigitSpan(left, right)) {
      return match;
    }
    return pauseReplacement(style);
  });
}

/**
 * Fix pause-dashes that sit on a mark/atom boundary (e.g. after a hyperlink),
 * where the character before/after the dash is in a different text node.
 * Still requires a full ` - ` / ` – ` (spaces on both sides).
 */
export function applyBoundaryDashStyle(
  text: string,
  style: DashStyle,
  before: string,
  after: string
): string {
  let next = text;

  if (before && !/\s/.test(before)) {
    const lead = next.match(LEADING_PAUSE_DASH_RE);
    if (lead) {
      const rest = next.slice(lead[0].length);
      const right = rest[0] ?? "";
      if (!isDigitDigitSpan(before, right)) {
        next =
          style === "chicago"
            ? `${EM}${rest}`
            : ` ${EN} ${rest}`;
      }
    }
  }

  if (after && !/\s/.test(after)) {
    const trail = next.match(TRAILING_PAUSE_DASH_RE);
    if (trail) {
      const head = next.slice(0, next.length - trail[0].length);
      const left = head[head.length - 1] ?? "";
      if (!isDigitDigitSpan(left, after)) {
        next =
          style === "chicago"
            ? `${head}${EM}`
            : `${head} ${EN} `;
      }
    }
  }

  return next;
}

export type NormalizeContext = {
  /** Last character before this slice in the document (may be across a mark). */
  before?: string;
  /** First character after this slice in the document. */
  after?: string;
};

function applyDigitRanges(text: string): string {
  return text.replace(DIGIT_RANGE_RE, `$1${EN}$2`);
}

/**
 * Convert straight quotes to curly. Apostrophes between/after letters
 * become right single quotes (’).
 */
export function toSmartQuotes(text: string): string {
  let result = "";
  let inDouble = false;
  let inSingle = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      result += inDouble ? RDQ : LDQ;
      inDouble = !inDouble;
      continue;
    }
    if (ch === "'") {
      const prev = text[i - 1] ?? "";
      const nextCh = text[i + 1] ?? "";
      if (
        /[A-Za-z]/.test(prev) &&
        (/[A-Za-z]/.test(nextCh) ||
          nextCh === "" ||
          /[\s.,;:!?]/.test(nextCh))
      ) {
        result += RSQ;
        continue;
      }
      result += inSingle ? RSQ : LSQ;
      inSingle = !inSingle;
      continue;
    }
    result += ch;
  }
  return result;
}

function applySentenceCase(text: string): string {
  return text.replace(
    /(^|[.!?]\s+)([a-z])/g,
    (_, prefix: string, letter: string) => prefix + letter.toUpperCase()
  );
}

export function normalizePunctuation(
  text: string,
  options: NormalizePunctuationOptions,
  context: NormalizeContext = {}
): string {
  let next = text;
  const smartQuotes = options.smartQuotes !== false;
  const pauseDashes = options.pauseDashes !== false;
  // Opt-in: default false so compound/range hyphens stay put.
  const digitRanges = options.digitRanges === true;

  if (pauseDashes) {
    next = applyBoundaryDashStyle(
      next,
      options.dashStyle,
      context.before ?? "",
      context.after ?? ""
    );
    next = applyDashStyle(next, options.dashStyle);
  }
  if (digitRanges) {
    next = applyDigitRanges(next);
  }
  if (smartQuotes) {
    next = toSmartQuotes(next);
  }
  if (options.sentenceCase) {
    next = applySentenceCase(next);
  }
  next = next.replace(/ {2,}/g, " ");
  return next;
}
