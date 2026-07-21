/**
 * Essay title in YAML frontmatter (`title: …`) kept in sync with the
 * workspace filename stem (spec: paths are presentation; title is the label).
 */

// Horizontal whitespace only: `\s*` would cross the newline on a bare
// `title:` line and swallow the following field.
const TITLE_LINE_RE = /^title:[ \t]*(.*)$/m;

/** Strip `.md` and decode a workspace file name into a display title. */
export function fileNameToTitle(fileName: string): string {
  return fileName.replace(/\.md$/i, "").trim();
}

/**
 * Build a `.md` file name from a title. Preserves spaces and casing; removes
 * characters that break paths on common platforms.
 */
export function titleToFileName(title: string): string {
  const stem = title
    .trim()
    .replace(/[/\\?%*:|"<>]/g, "")
    .replace(/\s+/g, " ")
    .replace(/\.+$/g, "");
  const safe = stem || "untitled";
  return safe.toLowerCase().endsWith(".md") ? safe : `${safe}.md`;
}

/**
 * YAML-safe `title:` line. Values with YAML-significant characters (colons,
 * `#`, quotes, leading dashes…) are double-quoted so external parsers —
 * e.g. a personal-site static generator — read them correctly.
 */
export function yamlTitleLine(title: string): string {
  const needsQuoting =
    /[:#{}[\],&*!|>%@`"']/.test(title) || /^[\s-]|\s$/.test(title);
  if (!needsQuoting) return `title: ${title}`;
  const escaped = title.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `title: "${escaped}"`;
}

export function parseTitle(frontmatter: string): string | null {
  const match = frontmatter.match(TITLE_LINE_RE);
  if (!match) return null;
  let value = match[1].trim();
  if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) {
    value = value
      .slice(1, -1)
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, "\\");
  } else {
    value = value.replace(/^["']|["']$/g, "");
  }
  return value || null;
}

export function writeTitle(frontmatter: string, title: string): string {
  const cleaned = title.trim();
  const line = cleaned ? yamlTitleLine(cleaned) : null;

  if (!frontmatter) {
    if (!line) return "";
    return `---\n${line}\n---\n`;
  }

  if (TITLE_LINE_RE.test(frontmatter)) {
    if (!line) {
      return frontmatter.replace(/\n?title:\s*.*(?=\n)/, "");
    }
    return frontmatter.replace(TITLE_LINE_RE, line);
  }

  if (!line) return frontmatter;

  if (frontmatter.includes("\n---")) {
    return frontmatter.replace(/\n---\s*$/, `\n${line}\n---\n`);
  }
  return frontmatter.replace(/---\s*$/, `${line}\n---\n`);
}
