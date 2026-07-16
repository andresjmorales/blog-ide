import { splitFrontmatter } from "@/lib/markdown/frontmatter";
import {
  fileNameToTitle,
  parseTitle,
  writeTitle,
} from "@/lib/markdown/titleFrontmatter";

const LEADING_H1_RE = /^#\s+([^\n]+)\n*/;

/**
 * Pull a leading `# Heading` out of the body. Essay titles live in
 * frontmatter + the Title field, not as Heading 1 in the body.
 */
export function stripLeadingH1(body: string): {
  h1: string | null;
  body: string;
} {
  const match = body.match(LEADING_H1_RE);
  if (!match) return { h1: null, body };
  return {
    h1: match[1].trim(),
    body: body.slice(match[0].length),
  };
}

/**
 * Normalize a full markdown document so the title is only in frontmatter
 * and the body does not start with a duplicate H1.
 */
export function normalizeEssayTitle(
  markdown: string,
  fallbackFileName?: string | null
): { frontmatter: string; body: string; title: string; changed: boolean } {
  const split = splitFrontmatter(markdown);
  const { h1, body } = stripLeadingH1(split.body);
  const fromFm = parseTitle(split.frontmatter);
  const title =
    fromFm ||
    h1 ||
    (fallbackFileName ? fileNameToTitle(fallbackFileName) : null) ||
    "Untitled";
  const nextFrontmatter = writeTitle(split.frontmatter, title);
  const changed =
    nextFrontmatter !== split.frontmatter || body !== split.body;
  return {
    frontmatter: nextFrontmatter,
    body,
    title,
    changed,
  };
}
