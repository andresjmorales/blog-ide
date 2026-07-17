/**
 * Optional essay subtitle / deck. Stored in YAML frontmatter as
 * `subtitle:` so it survives the TipTap round-trip (unlike HTML comments
 * in the body). The rich-text body stays free of a duplicate subtitle block.
 */

const SUBTITLE_LINE_RE = /^subtitle:\s*(.*)$/m;

export function parseSubtitle(frontmatter: string): string {
  const match = frontmatter.match(SUBTITLE_LINE_RE);
  if (!match) return "";
  return match[1].trim().replace(/^["']|["']$/g, "");
}

export function writeSubtitle(
  frontmatter: string,
  subtitle: string
): string {
  const cleaned = subtitle.replace(/\s+$/g, "").trimStart();
  const line = cleaned ? `subtitle: ${cleaned}` : null;

  if (!frontmatter) {
    if (!line) return "";
    return `---\n${line}\n---\n`;
  }

  if (SUBTITLE_LINE_RE.test(frontmatter)) {
    if (!line) {
      return frontmatter.replace(/\n?subtitle:\s*.*(?=\n)/, "");
    }
    return frontmatter.replace(SUBTITLE_LINE_RE, line);
  }

  if (!line) return frontmatter;

  if (frontmatter.includes("\n---")) {
    return frontmatter.replace(/\n---\s*$/, `\n${line}\n---\n`);
  }
  return frontmatter.replace(/---\s*$/, `${line}\n---\n`);
}

/**
 * Legacy: pull a body-marked subtitle into frontmatter if present.
 *   <!--blogide-subtitle-->
 *   Deck text
 */
const LEGACY_SUBTITLE_BLOCK_RE =
  /^<!--blogide-subtitle-->\r?\n([\s\S]*?)\r?\n(?:\r?\n|$)/;

export function migrateLegacySubtitle(body: string): {
  subtitle: string | null;
  body: string;
} {
  const match = body.match(LEGACY_SUBTITLE_BLOCK_RE);
  if (!match) return { subtitle: null, body };
  return {
    subtitle: match[1].replace(/\r?\n$/, "").trimEnd(),
    body: body.slice(match[0].length),
  };
}
