import type { Editor } from "@tiptap/core";
import type { Node as PmNode } from "@tiptap/pm/model";

/**
 * Copyedit engine: regex passes over each textblock's visible text, mapped
 * back to document positions so matches can be found, selected, and fixed.
 *
 * A textblock's children map 1:1 onto a string: text nodes contribute their
 * text, every inline atom (footnote, math, hard break) one placeholder
 * character. So string index `i` is document position `blockPos + 1 + i`,
 * and a match may span mark boundaries (`**link** - clause`).
 */

/** Stand-in for an inline atom (footnote marker, inline math, image). */
export const ATOM_CHAR = "￼";
/** Stand-in for inline `code` text, which copyedit never touches. */
const CODE_CHAR = "\u0000";

export type TextRange = { from: number; to: number };

export type CopyeditMatch = TextRange & {
  /** Matched text as it appears in the essay. */
  text: string;
  /** Replacement, or null when the match is find-only. */
  replacement: string | null;
};

export type BlockText = {
  /** Position of the first character inside the textblock. */
  start: number;
  text: string;
  /** Heading level, when the block is a heading. */
  headingLevel?: number;
};

type Rule = {
  pattern: RegExp;
  /** Return the replacement, or null to skip this match. */
  replace: (match: RegExpExecArray, text: string) => string | null;
};

function blockString(node: PmNode): string {
  let out = "";
  node.forEach((child) => {
    if (child.isText) {
      const value = child.text ?? "";
      out += child.marks.some((mark) => mark.type.name === "code")
        ? CODE_CHAR.repeat(value.length)
        : value;
    } else {
      out += ATOM_CHAR.repeat(child.nodeSize);
    }
  });
  return out;
}

/** Visible text of each prose textblock (code blocks skipped). */
export function collectBlockTexts(doc: PmNode): BlockText[] {
  const blocks: BlockText[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name === "codeBlock") return false;
    if (!node.isTextblock) return;
    blocks.push({
      start: pos + 1,
      text: blockString(node),
      headingLevel:
        node.type.name === "heading" ? Number(node.attrs.level ?? 1) : undefined,
    });
    return false;
  });
  return blocks;
}

/** Selection range, or the whole essay when nothing is selected. */
export function copyeditScope(editor: Editor): TextRange & { selection: boolean } {
  const { from, to, empty } = editor.state.selection;
  return empty
    ? { from: 0, to: editor.state.doc.content.size, selection: false }
    : { from, to, selection: true };
}

export function findMatches(
  blocks: BlockText[],
  rule: Rule,
  range?: TextRange
): CopyeditMatch[] {
  const matches: CopyeditMatch[] = [];
  for (const block of blocks) {
    const blockEnd = block.start + block.text.length;
    if (range && (blockEnd < range.from || block.start > range.to)) continue;
    const re = new RegExp(rule.pattern.source, rule.pattern.flags.includes("g")
      ? rule.pattern.flags
      : `${rule.pattern.flags}g`);
    let match: RegExpExecArray | null;
    while ((match = re.exec(block.text)) !== null) {
      if (match[0].length === 0) {
        re.lastIndex += 1;
        continue;
      }
      if (match[0].includes(CODE_CHAR) || match[0].includes(ATOM_CHAR)) {
        continue;
      }
      const from = block.start + match.index;
      const to = from + match[0].length;
      if (range && (from < range.from || to > range.to)) continue;
      matches.push({
        from,
        to,
        text: match[0],
        replacement: rule.replace(match, block.text),
      });
    }
  }
  return matches;
}

/**
 * Replace matches in one transaction (one undo step). Each replacement keeps
 * the marks of the first non-space character it replaces, so a dash after a
 * link does not become part of the link.
 */
export function applyMatches(editor: Editor, matches: CopyeditMatch[]): number {
  const fixable = matches
    .filter((m) => m.replacement != null && m.replacement !== m.text)
    .sort((a, b) => b.from - a.from);
  if (fixable.length === 0) return 0;
  const { state } = editor;
  const tr = state.tr;
  let lastFrom = Infinity;
  let applied = 0;
  for (const match of fixable) {
    // Overlapping matches (from different rules) — keep the later one only.
    if (match.to > lastFrom) continue;
    // Stale match (the essay changed since the scan) — never guess.
    if (state.doc.textBetween(match.from, match.to, "\n", ATOM_CHAR) !== match.text) {
      continue;
    }
    const anchor = match.from + Math.max(0, match.text.search(/\S/));
    const marks = state.doc.nodeAt(anchor)?.marks ?? [];
    const replacement = match.replacement ?? "";
    if (replacement) {
      tr.replaceWith(match.from, match.to, state.schema.text(replacement, marks));
    } else {
      tr.delete(match.from, match.to);
    }
    lastFrom = match.from;
    applied += 1;
  }
  if (!tr.docChanged) return 0;
  editor.view.dispatch(tr.scrollIntoView());
  return applied;
}

/** Select a match in the editor and scroll it into view. */
export function revealMatch(editor: Editor, match: TextRange) {
  editor
    .chain()
    .setTextSelection({ from: match.from, to: match.to })
    .scrollIntoView()
    .focus(undefined, { scrollIntoView: false })
    .run();
}

// ---------------------------------------------------------------------------
// Dashes

const EM = "—";
const EN = "–";

/** Dash shapes a draft can contain (source side of the converter). */
export type DashForm =
  | "spaced-hyphen"
  | "double-hyphen"
  | "spaced-en"
  | "spaced-em"
  | "closed-em";

/** Dash shapes the converter can write (house styles). */
export type DashTarget = "closed-em" | "spaced-em" | "spaced-en";

export const DASH_FORMS: { id: DashForm; label: string; sample: string }[] = [
  { id: "spaced-en", label: "Spaced en dash", sample: "word – word" },
  { id: "spaced-hyphen", label: "Spaced hyphen", sample: "word - word" },
  { id: "double-hyphen", label: "Double hyphen", sample: "word--word" },
  { id: "spaced-em", label: "Spaced em dash", sample: "word — word" },
  { id: "closed-em", label: "Closed em dash", sample: "word—word" },
];

export const DASH_TARGETS: { id: DashTarget; label: string; sample: string }[] = [
  { id: "closed-em", label: "Closed em dash (Chicago, US)", sample: "word—word" },
  { id: "spaced-en", label: "Spaced en dash (UK, MLA)", sample: "word – word" },
  { id: "spaced-em", label: "Spaced em dash (AP, news)", sample: "word — word" },
];

const DASH_PATTERNS: Record<DashForm, RegExp> = {
  // Spaces required: `good-faith` and `12-14` are never pause dashes.
  "spaced-hyphen": /(?<=\S)[ \t]+-[ \t]+(?=\S)/g,
  "double-hyphen": /(?<=\S)[ \t]*-{2,3}[ \t]*(?=\S)/g,
  "spaced-en": /(?<=\S)[ \t]+–[ \t]+(?=\S)/g,
  "spaced-em": /(?<=\S)[ \t]+—[ \t]+(?=\S)/g,
  "closed-em": /(?<=[^\s—])—(?=[^\s—])/g,
};

export function dashTargetText(target: DashTarget): string {
  if (target === "closed-em") return EM;
  if (target === "spaced-em") return ` ${EM} `;
  return ` ${EN} `;
}

/** The form a target writes, so it is never "converted" into itself. */
export function dashTargetForm(target: DashTarget): DashForm {
  return target === "closed-em"
    ? "closed-em"
    : target === "spaced-em"
      ? "spaced-em"
      : "spaced-en";
}

function isDigitRange(match: RegExpExecArray, text: string): boolean {
  const left = text[match.index - 1] ?? "";
  const right = text[match.index + match[0].length] ?? "";
  return /\d/.test(left) && /\d/.test(right);
}

export function dashRule(form: DashForm, target: DashTarget): Rule {
  return {
    pattern: DASH_PATTERNS[form],
    replace: (match, text) => {
      // `15 - 16` is a range, not an aside.
      if (form !== "closed-em" && isDigitRange(match, text)) return null;
      return dashTargetText(target);
    },
  };
}

export function findDashes(
  blocks: BlockText[],
  form: DashForm,
  target: DashTarget,
  range?: TextRange
): CopyeditMatch[] {
  return findMatches(blocks, dashRule(form, target), range).filter(
    (match) => match.replacement != null
  );
}

/** Count each dash form in the blocks (for the converter and the check). */
export function dashInventory(
  blocks: BlockText[],
  range?: TextRange
): Record<DashForm, number> {
  const counts = {} as Record<DashForm, number>;
  for (const form of DASH_FORMS) {
    counts[form.id] = findDashes(blocks, form.id, "closed-em", range).length;
  }
  return counts;
}

/** Settings store the house style by guide name; map to converter targets. */
export function dashTargetFromStyle(
  style: "chicago" | "mla" | "ap" | undefined
): DashTarget {
  return style === "mla" ? "spaced-en" : style === "ap" ? "spaced-em" : "closed-em";
}

// ---------------------------------------------------------------------------
// Formatting check

export type CopyeditIssueId =
  | "straight-quotes"
  | "mixed-dashes"
  | "double-spaces"
  | "space-before-punct"
  | "repeated-word"
  | "three-dots"
  | "digit-range"
  | "edge-spaces"
  | "heading-skip";

export type CopyeditIssue = {
  id: CopyeditIssueId;
  label: string;
  detail: string;
  matches: CopyeditMatch[];
  /** Label for the bulk fix, when every match can be fixed automatically. */
  fixLabel?: string;
};

/** Words that legitimately repeat ("had had", "that that"). */
const REPEAT_OK = new Set(["had", "that", "is", "do", "very", "no", "bye", "ha", "so"]);

function curly(text: string, index: number, quote: string): string {
  const prev = text[index - 1] ?? "";
  const opens = !prev || /[\s([{—–/￼-]/.test(prev);
  if (quote === '"') return opens ? "“" : "”";
  // Apostrophes (don't, '90s after a space is rare enough) close.
  return opens ? "‘" : "’";
}

const RULES: Record<Exclude<CopyeditIssueId, "mixed-dashes" | "heading-skip">, Rule> = {
  "straight-quotes": {
    pattern: /["']/g,
    replace: (match, text) => curly(text, match.index, match[0]),
  },
  "double-spaces": {
    pattern: /(?<=\S) {2,}(?=\S)/g,
    replace: () => " ",
  },
  "space-before-punct": {
    pattern: /(?<=[\p{L}\p{N}”’)]) +(?=[,.;:!?](?:\s|$))/gu,
    replace: () => "",
  },
  "repeated-word": {
    pattern: /\b([\p{L}’']+)\s+\1\b/giu,
    replace: () => null,
  },
  "three-dots": {
    pattern: /(?<!\.)\.\.\.(?!\.)/g,
    replace: () => "…",
  },
  "digit-range": {
    pattern: /(?<=\b\d{1,4})-(?=\d{1,4}\b)/g,
    replace: () => EN,
  },
  "edge-spaces": {
    pattern: /^[ \t]+|[ \t]+$/g,
    replace: () => "",
  },
};

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;
}

/**
 * Deterministic formatting checks. Everything here is either fixable in one
 * click or findable; judgment calls (voice, spelling variants) go to AI.
 */
export function runFormattingCheck(
  doc: PmNode,
  options: { dashTarget: DashTarget; range?: TextRange }
): CopyeditIssue[] {
  const blocks = collectBlockTexts(doc);
  const range = options.range;
  const issues: CopyeditIssue[] = [];

  const quotes = findMatches(blocks, RULES["straight-quotes"], range);
  if (quotes.length) {
    issues.push({
      id: "straight-quotes",
      label: `${plural(quotes.length, "straight quote")}`,
      detail: `Typewriter " and ' where the rest of the essay uses “curly” quotes.`,
      matches: quotes,
      fixLabel: "Curl",
    });
  }

  // Any pause dash not in the house style.
  const targetForm = dashTargetForm(options.dashTarget);
  const offStyle: CopyeditMatch[] = [];
  const offForms: string[] = [];
  for (const form of DASH_FORMS) {
    if (form.id === targetForm) continue;
    const found = findDashes(blocks, form.id, options.dashTarget, range);
    if (found.length) {
      offStyle.push(...found);
      const name = form.label.toLowerCase();
      offForms.push(
        plural(found.length, name, name.endsWith("dash") ? `${name}es` : `${name}s`)
      );
    }
  }
  if (offStyle.length) {
    offStyle.sort((a, b) => a.from - b.from);
    const target = DASH_TARGETS.find((t) => t.id === options.dashTarget);
    issues.push({
      id: "mixed-dashes",
      label: `${plural(offStyle.length, "dash", "dashes")} off house style`,
      detail: `${offForms.join(", ")}. House style: ${target?.sample ?? ""}.`,
      matches: offStyle,
      fixLabel: "Convert",
    });
  }

  const doubles = findMatches(blocks, RULES["double-spaces"], range);
  if (doubles.length) {
    issues.push({
      id: "double-spaces",
      label: plural(doubles.length, "double space"),
      detail: "Two or more spaces between words.",
      matches: doubles,
      fixLabel: "Collapse",
    });
  }

  const beforePunct = findMatches(blocks, RULES["space-before-punct"], range);
  if (beforePunct.length) {
    issues.push({
      id: "space-before-punct",
      label: plural(beforePunct.length, "space before punctuation", "spaces before punctuation"),
      detail: "A space before , . ; : ! or ?",
      matches: beforePunct,
      fixLabel: "Remove",
    });
  }

  const edges = findMatches(blocks, RULES["edge-spaces"], range);
  if (edges.length) {
    issues.push({
      id: "edge-spaces",
      label: plural(edges.length, "stray leading/trailing space", "stray leading/trailing spaces"),
      detail: "Spaces at the start or end of a paragraph.",
      matches: edges,
      fixLabel: "Trim",
    });
  }

  const repeats = findMatches(blocks, RULES["repeated-word"], range).filter(
    (match) => !REPEAT_OK.has(match.text.split(/\s+/)[0].toLowerCase())
  );
  if (repeats.length) {
    issues.push({
      id: "repeated-word",
      label: plural(repeats.length, "repeated word"),
      detail: "“the the” and friends. Check each one.",
      matches: repeats,
    });
  }

  const dots = findMatches(blocks, RULES["three-dots"], range);
  if (dots.length) {
    issues.push({
      id: "three-dots",
      label: plural(dots.length, "three-dot ellipsis", "three-dot ellipses"),
      detail: "... → … (one character).",
      matches: dots,
      fixLabel: "Replace",
    });
  }

  const ranges = findMatches(blocks, RULES["digit-range"], range);
  if (ranges.length) {
    issues.push({
      id: "digit-range",
      label: plural(ranges.length, "number range with a hyphen", "number ranges with a hyphen"),
      detail: "12-14 → 12–14 (en dash). Skip phone numbers and IDs.",
      matches: ranges,
      fixLabel: "Use en dash",
    });
  }

  const skips: CopyeditMatch[] = [];
  let prevLevel = 0;
  for (const block of blocks) {
    if (block.headingLevel == null) continue;
    if (range && (block.start < range.from || block.start > range.to)) {
      prevLevel = block.headingLevel;
      continue;
    }
    if (prevLevel && block.headingLevel > prevLevel + 1) {
      skips.push({
        from: block.start,
        to: block.start + block.text.length,
        text: block.text,
        replacement: null,
      });
    }
    prevLevel = block.headingLevel;
  }
  if (skips.length) {
    issues.push({
      id: "heading-skip",
      label: plural(skips.length, "skipped heading level"),
      detail: "e.g. a Heading 4 straight after a Heading 2. Screen readers and outlines stumble.",
      matches: skips,
    });
  }

  return issues;
}

/** Fix every fixable match of one issue. */
export function fixIssue(editor: Editor, issue: CopyeditIssue): number {
  return applyMatches(editor, issue.matches);
}
