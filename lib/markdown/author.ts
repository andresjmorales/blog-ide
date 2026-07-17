/**
 * Optional essay author byline. Stored in YAML frontmatter as `author:`.
 */

const AUTHOR_LINE_RE = /^author:\s*(.*)$/m;

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
    if (!line) {
      return frontmatter.replace(/\n?author:\s*.*(?=\n)/, "");
    }
    return frontmatter.replace(AUTHOR_LINE_RE, line);
  }

  if (!line) return frontmatter;

  if (frontmatter.includes("\n---")) {
    return frontmatter.replace(/\n---\s*$/, `\n${line}\n---\n`);
  }
  return frontmatter.replace(/---\s*$/, `${line}\n---\n`);
}
