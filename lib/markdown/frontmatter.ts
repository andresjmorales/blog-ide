/**
 * YAML frontmatter is held verbatim and re-emitted untouched (spec §4.1):
 * the editor never parses or rewrites it, so round-trips can't mangle it.
 */
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
