/**
 * YAML frontmatter is held verbatim and re-emitted untouched (spec §4.1):
 * the editor never parses or rewrites it, so round-trips can't mangle it.
 */
import { yamlTitleLine } from "@/lib/markdown/titleFrontmatter";

export type SplitDocument = {
  /** Raw frontmatter block including `---` fences and trailing newline; "" if absent. */
  frontmatter: string;
  /** Markdown body after the frontmatter block. */
  body: string;
};

const FRONTMATTER_RE = /^---\r?\n[\s\S]*?\r?\n---\r?\n/;

export function splitFrontmatter(markdown: string): SplitDocument {
  const match = markdown.match(FRONTMATTER_RE);
  if (!match) {
    return { frontmatter: "", body: markdown };
  }
  return {
    frontmatter: match[0],
    body: markdown.slice(match[0].length),
  };
}

export function joinFrontmatter(doc: SplitDocument): string {
  return doc.frontmatter + doc.body;
}

/**
 * Frontmatter for a new essay. Matches the personal-site publishing schema:
 * title/subtitle/author map to BlogIDE's own fields; date, description,
 * tags, and canonical stay empty until filled in by hand (or a future UI).
 * Ends with a blank line so the body starts separated from the block.
 */
export function newEssayFrontmatter(title: string): string {
  return [
    "---",
    yamlTitleLine(title),
    "subtitle:",
    "author:",
    "date:",
    "description:",
    "tags:",
    "canonical:",
    "status: draft",
    "---",
    "",
    "",
  ].join("\n");
}
