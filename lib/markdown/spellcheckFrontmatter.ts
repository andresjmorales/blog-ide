/**
 * Per-essay spellcheck lives in YAML frontmatter as:
 *   spellcheck: on|off          (optional; absent = inherit account default)
 *   spellcheck_langs: en-US, es (optional; absent = inherit account defaults)
 * Kept as simple line rewrites so the rest of frontmatter stays verbatim.
 */

// Horizontal whitespace only: `\s*` would cross the newline on a bare
// `spellcheck_langs:` / `spellcheck:` line and swallow the following field.
const LANGS_LINE_RE = /^spellcheck_langs:[ \t]*(.*)$/m;
const ENABLED_LINE_RE = /^spellcheck:[ \t]*(.*)$/m;

export type SpellcheckOverride = "on" | "off" | null;

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

  return writeOrRemoveLine(frontmatter, LANGS_LINE_RE, "spellcheck_langs", line);
}

/**
 * Per-essay on/off override. `null` means inherit the account default
 * (no `spellcheck:` line).
 */
export function parseSpellcheckOverride(
  frontmatter: string
): SpellcheckOverride {
  const match = frontmatter.match(ENABLED_LINE_RE);
  if (!match) return null;
  const value = match[1].trim().toLowerCase();
  if (value === "on" || value === "true" || value === "yes") return "on";
  if (value === "off" || value === "false" || value === "no") return "off";
  return null;
}

export function writeSpellcheckOverride(
  frontmatter: string,
  override: SpellcheckOverride
): string {
  const line =
    override === "on"
      ? "spellcheck: on"
      : override === "off"
        ? "spellcheck: off"
        : null;
  return writeOrRemoveLine(frontmatter, ENABLED_LINE_RE, "spellcheck", line);
}

function writeOrRemoveLine(
  frontmatter: string,
  pattern: RegExp,
  key: string,
  line: string | null
): string {
  if (!frontmatter) {
    if (!line) return "";
    return `---\n${line}\n---\n`;
  }

  if (pattern.test(frontmatter)) {
    if (!line) {
      return frontmatter.replace(new RegExp(`\\n?${key}:\\s*.*(?=\\n)`), "");
    }
    return frontmatter.replace(pattern, line);
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

/**
 * Effective spellcheck enabled: essay override wins, else account default.
 */
export function resolveSpellcheckEnabled(
  override: SpellcheckOverride,
  globalEnabled: boolean
): boolean {
  if (override === "on") return true;
  if (override === "off") return false;
  return globalEnabled;
}

/**
 * Toggle a language in an ordered list. Newly enabled languages become
 * primary (index 0) so browser `lang` matches what the writer just picked.
 *
 * When `current` is empty (inheriting defaults), the first edit materializes
 * an override from `defaults`, with the toggled code as primary when enabling.
 */
export function toggleSpellcheckLanguage(
  current: string[],
  defaults: string[],
  code: string
): string[] {
  const base = current.length > 0 ? current : defaults;

  if (base.includes(code)) {
    const next = base.filter((item) => item !== code);
    // Clearing the last essay language returns [] (= inherit defaults).
    if (current.length === 0) {
      // Unchecking a default while still inheriting → write the remaining
      // defaults as an explicit override (or [] if none left).
      return next;
    }
    return next;
  }

  // Enable: new primary, keep the rest in prior order.
  return [code, ...base.filter((item) => item !== code)];
}

/**
 * Promote an already-selected language to primary (browser `lang` target).
 */
export function promoteSpellcheckLanguage(
  languages: string[],
  code: string
): string[] {
  if (!languages.includes(code)) return languages;
  return [code, ...languages.filter((item) => item !== code)];
}
