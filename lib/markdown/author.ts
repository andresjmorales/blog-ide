/**
 * Optional essay author byline. Stored in YAML frontmatter as `author:`.
 */

// Horizontal whitespace only: `\s*` would cross the newline on a bare
// `author:` line and swallow the following field.
const AUTHOR_LINE_RE = /^author:[ \t]*(.*)$/m;

export function parseAuthor(frontmatter: string): string {
  const match = frontmatter.match(AUTHOR_LINE_RE);
  if (!match) return "";
  return match[1].trim().replace(/^["']|["']$/g, "");
}

export function writeAuthor(frontmatter: string, author: string): string {
  const cleaned = author.replace(/\s+$/g, "").trimStart();
  const line = cleaned ? `author: ${cleaned}` : null;

  if (!frontmatter) {
    if (!line) return "";
    return `---\n${line}\n---\n`;
  }

  if (AUTHOR_LINE_RE.test(frontmatter)) {
    // Keep an existing key as a bare `author:` when cleared — template
    // fields must survive edits so exports match the publishing schema.
    return frontmatter.replace(AUTHOR_LINE_RE, line ?? "author:");
  }

  if (!line) return frontmatter;

  if (frontmatter.includes("\n---")) {
    return frontmatter.replace(/\n---\s*$/, `\n${line}\n---\n`);
  }
  return frontmatter.replace(/---\s*$/, `${line}\n---\n`);
}
