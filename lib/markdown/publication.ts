/**
 * Optional free-text venue / magazine / paper the essay was written for.
 * Stored in YAML frontmatter as `publication:`. BlogIDE-only metadata —
 * personal-site ignores unknown keys.
 */

// Horizontal whitespace only: `\s*` would cross the newline on a bare
// `publication:` line and swallow the following field.
const PUBLICATION_LINE_RE = /^publication:[ \t]*(.*)$/m;

export function parsePublication(frontmatter: string): string {
  const match = frontmatter.match(PUBLICATION_LINE_RE);
  if (!match) return "";
  return match[1].trim().replace(/^["']|["']$/g, "");
}

export function writePublication(
  frontmatter: string,
  publication: string
): string {
  const cleaned = publication.replace(/\s+$/g, "").trimStart();
  const line = cleaned ? `publication: ${cleaned}` : null;

  if (!frontmatter) {
    if (!line) return "";
    return `---\n${line}\n---\n`;
  }

  if (PUBLICATION_LINE_RE.test(frontmatter)) {
    // Keep an existing key as a bare `publication:` when cleared — template
    // fields must survive edits so exports match the publishing schema.
    return frontmatter.replace(PUBLICATION_LINE_RE, line ?? "publication:");
  }

  if (!line) return frontmatter;

  if (frontmatter.includes("\n---")) {
    return frontmatter.replace(/\n---\s*$/, `\n${line}\n---\n`);
  }
  return frontmatter.replace(/---\s*$/, `${line}\n---\n`);
}
