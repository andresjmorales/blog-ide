/**
 * Per-essay spellcheck languages live in YAML frontmatter as:
 *   spellcheck_langs: en-US, es
 * Kept as a simple line rewrite so the rest of frontmatter stays verbatim.
 */

const LANGS_LINE_RE = /^spellcheck_langs:\s*(.*)$/m;

export const SPELLCHECK_LANGUAGE_OPTIONS: Array<{
  code: string;
  label: string;
}> = [
  { code: "en-US", label: "English (US)" },
  { code: "en-GB", label: "English (UK)" },
  { code: "es", label: "Spanish" },
  { code: "fr", label: "French" },
  { code: "de", label: "German" },
  { code: "it", label: "Italian" },
  { code: "pt", label: "Portuguese" },
  { code: "nl", label: "Dutch" },
  { code: "pl", label: "Polish" },
  { code: "sv", label: "Swedish" },
];

export function parseSpellcheckLangs(frontmatter: string): string[] {
  const match = frontmatter.match(LANGS_LINE_RE);
  if (!match) return [];
  return match[1]
    .split(/[, ]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function writeSpellcheckLangs(
  frontmatter: string,
  languages: string[]
): string {
  const line =
    languages.length > 0
      ? `spellcheck_langs: ${languages.join(", ")}`
      : null;

  if (!frontmatter) {
    if (!line) return "";
    return `---\n${line}\n---\n`;
  }

  if (LANGS_LINE_RE.test(frontmatter)) {
    if (!line) {
      return frontmatter.replace(/\n?spellcheck_langs:\s*.*(?=\n)/, "");
    }
    return frontmatter.replace(LANGS_LINE_RE, line);
  }

  if (!line) return frontmatter;

  // Insert before closing ---
  if (frontmatter.includes("\n---")) {
    return frontmatter.replace(/\n---\s*$/, `\n${line}\n---\n`);
  }
  return frontmatter.replace(/---\s*$/, `${line}\n---\n`);
}

export function primaryLang(languages: string[], fallback = "en"): string {
  return languages[0] ?? fallback;
}
