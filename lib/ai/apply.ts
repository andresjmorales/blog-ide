import { unwrapMarkdownReply } from "@/lib/ai/client";
import { writeTitle, parseTitle } from "@/lib/markdown/titleFrontmatter";
import { splitFrontmatter } from "@/lib/markdown/frontmatter";
import { stripBlogideTrailers } from "@/lib/markdown/essayCitations";

export type SearchReplacePatch = {
  search: string;
  replace: string;
};

/**
 * Optional patch format models may emit instead of a full rewrite:
 *
 * <<<SEARCH
 * exact text
 * ===
 * replacement
 * >>>REPLACE
 */
const PATCH_RE =
  /<<<SEARCH\r?\n([\s\S]*?)\r?\n===\r?\n([\s\S]*?)\r?\n>>>REPLACE/g;

export function parseSearchReplacePatches(
  text: string
): SearchReplacePatch[] | null {
  const patches: SearchReplacePatch[] = [];
  let match: RegExpExecArray | null;
  const re = new RegExp(PATCH_RE.source, "g");
  while ((match = re.exec(text)) !== null) {
    const search = match[1];
    const replace = match[2];
    if (search.length > 0) {
      patches.push({ search, replace });
    }
  }
  return patches.length > 0 ? patches : null;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Quote / dash / whitespace variants models often "normalize" when copying. */
const LOOSE_CHAR: Record<string, string> = {
  "'": "['‘’]",
  "‘": "['‘’]",
  "’": "['‘’]",
  '"': '["“”]',
  "“": '["“”]',
  "”": '["“”]',
  "-": "[-–—]",
  "–": "[-–—]",
  "—": "[-–—]",
};

/**
 * Locate a SEARCH block in the essay. Exact match first; then a tolerant pass
 * that ignores whitespace runs and curly/straight quote or dash differences.
 */
export function findPatchRange(
  source: string,
  search: string
): { from: number; to: number } | null {
  const exact = source.indexOf(search);
  if (exact !== -1) return { from: exact, to: exact + search.length };
  const trimmed = search.trim();
  if (!trimmed) return null;
  const trimmedExact = source.indexOf(trimmed);
  if (trimmedExact !== -1) {
    return { from: trimmedExact, to: trimmedExact + trimmed.length };
  }
  const pattern = trimmed
    .split(/\s+/)
    .map((word) =>
      [...word].map((ch) => LOOSE_CHAR[ch] ?? escapeRegExp(ch)).join("")
    )
    .join("\\s+");
  try {
    const match = new RegExp(pattern).exec(source);
    if (!match) return null;
    return { from: match.index, to: match.index + match[0].length };
  } catch {
    return null;
  }
}

export function applySearchReplacePatches(
  source: string,
  patches: SearchReplacePatch[]
): { markdown: string; applied: number; failed: string[] } {
  let markdown = source;
  let applied = 0;
  const failed: string[] = [];
  for (const patch of patches) {
    const range = findPatchRange(markdown, patch.search);
    if (!range) {
      failed.push(patch.search.slice(0, 80));
      continue;
    }
    markdown =
      markdown.slice(0, range.from) + patch.replace + markdown.slice(range.to);
    applied += 1;
  }
  return { markdown, applied, failed };
}

export type ReplySegment =
  | { type: "text"; text: string }
  | { type: "patch"; index: number; search: string; replace: string }
  /** A patch block still streaming in (no closing marker yet). */
  | { type: "pending-patch" };

/** Split an assistant reply into prose and patch blocks for rendering. */
export function splitReplySegments(text: string): ReplySegment[] {
  const segments: ReplySegment[] = [];
  const re = new RegExp(PATCH_RE.source, "g");
  let last = 0;
  let index = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const before = text.slice(last, match.index);
    if (before.trim()) segments.push({ type: "text", text: before });
    if (match[1].length > 0) {
      segments.push({
        type: "patch",
        index,
        search: match[1],
        replace: match[2],
      });
      index += 1;
    }
    last = match.index + match[0].length;
  }
  let rest = text.slice(last);
  const open = rest.indexOf("<<<SEARCH");
  if (open !== -1) {
    const before = rest.slice(0, open);
    if (before.trim()) segments.push({ type: "text", text: before });
    segments.push({ type: "pending-patch" });
    rest = "";
  }
  if (rest.trim()) segments.push({ type: "text", text: rest });
  return segments;
}

/** Heuristic: reply looks like a full essay (frontmatter or multi-heading body). */
export function looksLikeFullMarkdownDocument(text: string): boolean {
  const trimmed = unwrapMarkdownReply(text);
  if (!trimmed) return false;
  if (/^---\r?\n[\s\S]*?\r?\n---\r?\n/.test(trimmed)) return true;
  const lines = trimmed.split("\n");
  if (lines.length < 4) return false;
  const headings = lines.filter((line) => /^#{1,6}\s+\S/.test(line)).length;
  return headings >= 1 && trimmed.length > 280;
}

export function extractTitleSuggestion(text: string): string | null {
  // Uppercase only: frontmatter `title:` in a full-essay reply must not count.
  const match = text.match(/^[ \t]*TITLE:[ \t]*(.+?)[ \t]*$/m);
  if (!match) return null;
  const title = match[1].trim().replace(/^["'“”]|["'“”]$/g, "");
  return title || null;
}

const FOOTNOTE_DEF_START = /^\[\^([^\]\s]+)\]:/;
const FOOTNOTE_REF = /\[\^([^\]\s]+)\](?!:)/g;

/** Footnote definition blocks by label (first line plus indented continuation). */
export function footnoteDefinitions(markdown: string): Map<string, string> {
  const defs = new Map<string, string>();
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    const start = lines[i].match(FOOTNOTE_DEF_START);
    if (!start) continue;
    const block = [lines[i]];
    let j = i + 1;
    while (j < lines.length) {
      if (/^( {2,}|\t)\S/.test(lines[j])) {
        block.push(lines[j]);
        j += 1;
      } else if (lines[j].trim() === "" && /^( {2,}|\t)\S/.test(lines[j + 1] ?? "")) {
        block.push(lines[j]);
        j += 1;
      } else break;
    }
    if (!defs.has(start[1])) defs.set(start[1], block.join("\n"));
    i = j - 1;
  }
  return defs;
}

/**
 * Rewrites often keep `[^2]` markers but drop the `[^2]: …` lines. Inserting
 * that would create empty footnotes (and lose the notes), so copy any missing
 * definitions back from the text being replaced.
 */
export function restoreFootnoteDefinitions(reply: string, source: string): string {
  const defined = footnoteDefinitions(reply);
  const original = footnoteDefinitions(source);
  if (original.size === 0) return reply;
  const missing: string[] = [];
  for (const match of reply.matchAll(FOOTNOTE_REF)) {
    const label = match[1];
    if (defined.has(label) || missing.includes(label) || !original.has(label)) continue;
    missing.push(label);
  }
  if (missing.length === 0) return reply;
  return `${reply.replace(/\s+$/, "")}\n\n${missing
    .map((label) => original.get(label))
    .join("\n")}\n`;
}

/** Remove footnote definition blocks (the essay already holds them). */
export function withoutFootnoteDefinitions(markdown: string): string {
  const defs = footnoteDefinitions(markdown);
  let next = markdown;
  for (const block of defs.values()) next = next.replace(block, "");
  return next.replace(/\n{3,}/g, "\n\n").replace(/\s+$/, "");
}

/** BlogIDE data comments (`<!--blogide-…-->`) at the end of a document. */
function blogideTrailerText(markdown: string): string {
  const trimmed = markdown.replace(/\s+$/, "");
  const body = stripBlogideTrailers(trimmed).body.replace(/\s+$/, "");
  return trimmed.slice(body.length).trim();
}

/**
 * Make a full-essay reply safe to swap in: keep the essay's frontmatter
 * (title, subtitle, …) and BlogIDE trailers when the reply left them out, and
 * restore dropped footnote definitions.
 */
export function normalizeFullDocumentReply(reply: string, essay: string): string {
  let next = restoreFootnoteDefinitions(reply, essay);
  const essayParts = splitFrontmatter(essay);
  if (essayParts.frontmatter && !splitFrontmatter(next).frontmatter) {
    next = `${essayParts.frontmatter}\n${next.replace(/^\n+/, "")}`;
  }
  const trailer = blogideTrailerText(essay);
  if (trailer && !next.includes("<!--blogide-")) {
    next = `${next.replace(/\s+$/, "")}\n\n${trailer}\n`;
  }
  return next;
}

/** Drop a one-line lead-in like "Here's the revised essay:" before a rewrite. */
export function stripReplyPreface(text: string): string {
  const match = text.match(/^([^\n]{1,200}:)[ \t]*\n\s*\n([\s\S]+)$/);
  if (!match || /^(#|---|>|[-*] |\d+\. )/.test(match[1])) return text;
  // Only when what follows is substantial: a long passage or several paragraphs.
  const rest = match[2];
  const paragraphs = rest.split(/\n\s*\n/).filter((p) => p.trim()).length;
  return rest.length > 200 || paragraphs >= 2 ? rest : text;
}

/** Reply is most of the essay again (a rewrite without headings/frontmatter). */
function looksLikeEssayRewrite(reply: string, essay: string): boolean {
  const essayBody = splitFrontmatter(essay).body.trim();
  if (essayBody.length < 200) return false;
  const paragraphs = reply.split(/\n\s*\n/).filter((p) => p.trim()).length;
  const ratio = reply.length / essayBody.length;
  return paragraphs >= 2 && ratio > 0.5 && ratio < 2;
}

/** Apply a TITLE: suggestion into essay frontmatter. */
export function applyTitleToMarkdown(
  essayMarkdown: string,
  title: string
): string {
  const { frontmatter, body } = splitFrontmatter(essayMarkdown);
  const nextFm = writeTitle(frontmatter || "---\n---\n", title);
  const cleanedBody = body.replace(/^\n+/, "");
  return `${nextFm}${cleanedBody ? `\n${cleanedBody}` : "\n"}`;
}

export function currentTitle(essayMarkdown: string): string | null {
  const { frontmatter } = splitFrontmatter(essayMarkdown);
  return parseTitle(frontmatter);
}

export type PreparedApply =
  | {
      kind: "document";
      before: string;
      after: string;
      summary: string;
    }
  | {
      kind: "selection";
      before: string;
      after: string;
      summary: string;
    }
  | {
      kind: "patches";
      before: string;
      after: string;
      applied: number;
      failed: string[];
      summary: string;
    }
  | {
      kind: "title";
      before: string;
      after: string;
      title: string;
      summary: string;
    }
  | { kind: "none"; reason: string };

export function prepareApply(input: {
  reply: string;
  essayMarkdown: string | null;
  selectionText: string | null;
  scope: "essay" | "selection";
}): PreparedApply {
  const unwrapped = unwrapMarkdownReply(input.reply);
  if (!unwrapped.trim()) return { kind: "none", reason: "Nothing to apply." };
  const essay = input.essayMarkdown;

  // 1. Patch blocks: surgical edits against the current essay.
  if (essay) {
    const patches = parseSearchReplacePatches(input.reply);
    if (patches) {
      const result = applySearchReplacePatches(essay, patches);
      if (result.applied === 0) {
        return {
          kind: "none",
          reason: "Patch blocks did not match the open essay.",
        };
      }
      return {
        kind: "patches",
        before: essay,
        after: result.markdown,
        applied: result.applied,
        failed: result.failed,
        summary: `Apply ${result.applied} patch${result.applied === 1 ? "" : "es"}`,
      };
    }
  }

  const reply = stripReplyPreface(unwrapped);

  // 2. Selection rewrite.
  if (input.scope === "selection" && input.selectionText != null) {
    return {
      kind: "selection",
      before: input.selectionText,
      after: restoreFootnoteDefinitions(reply, input.selectionText),
      summary: "Replace selection",
    };
  }

  // 3. Whole-essay rewrite (checked before TITLE: so frontmatter can't be
  //    mistaken for a title suggestion).
  if (
    essay &&
    (looksLikeFullMarkdownDocument(reply) || looksLikeEssayRewrite(reply, essay))
  ) {
    const after = normalizeFullDocumentReply(reply, essay);
    if (after.trim() === essay.trim()) {
      return { kind: "none", reason: "The rewrite matches the essay already." };
    }
    return { kind: "document", before: essay, after, summary: "Replace essay" };
  }

  // 4. Title suggestion.
  const title = extractTitleSuggestion(unwrapped);
  if (title && essay) {
    const after = applyTitleToMarkdown(essay, title);
    if (after === essay) {
      return { kind: "none", reason: "Title is already set to that value." };
    }
    return {
      kind: "title",
      before: essay,
      after,
      title,
      summary: `Set title to “${title}”`,
    };
  }

  return {
    kind: "none",
    reason:
      "This reply isn't an edit to apply. Ask for a revision, or use Proofread / Tighten / Expand.",
  };
}
