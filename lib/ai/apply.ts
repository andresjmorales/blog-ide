import { unwrapMarkdownReply } from "@/lib/ai/client";
import { writeTitle, parseTitle } from "@/lib/markdown/titleFrontmatter";
import { splitFrontmatter } from "@/lib/markdown/frontmatter";

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
  const match = text.match(/^\s*TITLE:\s*(.+)\s*$/im);
  if (!match) return null;
  const title = match[1].trim().replace(/^["']|["']$/g, "");
  return title || null;
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
  const reply = unwrapMarkdownReply(input.reply);
  if (!reply.trim()) return { kind: "none", reason: "Nothing to apply." };

  const title = extractTitleSuggestion(input.reply);
  if (title && input.essayMarkdown) {
    const after = applyTitleToMarkdown(input.essayMarkdown, title);
    if (after === input.essayMarkdown) {
      return { kind: "none", reason: "Title is already set to that value." };
    }
    return {
      kind: "title",
      before: input.essayMarkdown,
      after,
      title,
      summary: `Set title to “${title}”`,
    };
  }

  if (input.essayMarkdown) {
    const patches = parseSearchReplacePatches(input.reply);
    if (patches) {
      const result = applySearchReplacePatches(input.essayMarkdown, patches);
      if (result.applied === 0) {
        return {
          kind: "none",
          reason: "Patch blocks did not match the open essay.",
        };
      }
      return {
        kind: "patches",
        before: input.essayMarkdown,
        after: result.markdown,
        applied: result.applied,
        failed: result.failed,
        summary: `Apply ${result.applied} patch${result.applied === 1 ? "" : "es"}`,
      };
    }
  }

  if (input.scope === "selection" && input.selectionText != null) {
    return {
      kind: "selection",
      before: input.selectionText,
      after: reply,
      summary: "Replace selection",
    };
  }

  if (input.essayMarkdown && looksLikeFullMarkdownDocument(reply)) {
    return {
      kind: "document",
      before: input.essayMarkdown,
      after: reply,
      summary: "Replace essay",
    };
  }

  if (input.essayMarkdown && reply.length > 40) {
    // Soft fallback: treat substantial markdown replies as document rewrites.
    if (
      reply.includes("\n") &&
      (reply.startsWith("#") ||
        reply.startsWith("---") ||
        /\[\^\d+\]/.test(reply))
    ) {
      return {
        kind: "document",
        before: input.essayMarkdown,
        after: reply,
        summary: "Replace essay",
      };
    }
  }

  return {
    kind: "none",
    reason:
      "Reply does not look like a rewrite, title, or patch. Ask for a revision, or use Tighten / Expand.",
  };
}
