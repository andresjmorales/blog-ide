/**
 * Line-level YAML frontmatter field helpers. The block stays opaque: we
 * rewrite one `key: value` line at a time so unknown keys and spacing
 * survive (see ARCHITECTURE.md / MARKDOWN_SPEC.md).
 */

export type FrontmatterField = { key: string; value: string };

/** Keys shown as the essay title/subtitle, not in the extra-fields menu. */
export const MAIN_UI_FRONTMATTER_KEYS = ["title", "subtitle"] as const;

/** Per-essay spellcheck lives in Essay settings, not the extra-fields menu. */
export const SETTINGS_FRONTMATTER_KEYS = [
  "spellcheck",
  "spellcheck_langs",
] as const;

/**
 * Publishing-schema fields hidden from the default title block and edited
 * from the extra-fields menu. Empty values keep a bare `key:` line.
 */
export const TEMPLATE_FRONTMATTER_KEYS = [
  "author",
  "publication",
  "date",
  "description",
  "tags",
  "canonical",
  "status",
] as const;

export type TemplateFrontmatterKey = (typeof TEMPLATE_FRONTMATTER_KEYS)[number];

export const TEMPLATE_FRONTMATTER_LABELS: Record<
  TemplateFrontmatterKey,
  string
> = {
  author: "Author",
  publication: "Publication",
  date: "Date",
  description: "Description",
  tags: "Tags",
  canonical: "Canonical URL",
  status: "Status",
};

const TEMPLATE_KEY_SET = new Set<string>(TEMPLATE_FRONTMATTER_KEYS);
const SETTINGS_KEY_SET = new Set<string>(SETTINGS_FRONTMATTER_KEYS);
const MAIN_UI_KEY_SET = new Set<string>(MAIN_UI_FRONTMATTER_KEYS);

const KEY_RE = /^[A-Za-z_][A-Za-z0-9_-]*$/;

export function isValidFrontmatterKey(key: string): boolean {
  return KEY_RE.test(key);
}

export function isReservedFrontmatterKey(key: string): boolean {
  return MAIN_UI_KEY_SET.has(key) || SETTINGS_KEY_SET.has(key);
}

export function isTemplateFrontmatterKey(
  key: string
): key is TemplateFrontmatterKey {
  return TEMPLATE_KEY_SET.has(key);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function linePattern(key: string): RegExp {
  return new RegExp(`^${escapeRegExp(key)}:[ \\t]*(.*)$`, "m");
}

function unquoteScalar(raw: string): string {
  const value = raw.trim();
  if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) {
    return value
      .slice(1, -1)
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, "\\");
  }
  if (value.startsWith("'") && value.endsWith("'") && value.length >= 2) {
    return value.slice(1, -1).replace(/''/g, "'");
  }
  return value;
}

function fieldLine(key: string, value: string): string {
  const cleaned = value.replace(/\s+$/g, "").trimStart().replace(/\s*\n\s*/g, " ");
  return cleaned ? `${key}: ${cleaned}` : `${key}:`;
}

export function parseFrontmatterFields(
  frontmatter: string
): FrontmatterField[] {
  if (!frontmatter) return [];
  const fields: FrontmatterField[] = [];
  const seen = new Set<string>();
  for (const line of frontmatter.split(/\r?\n/)) {
    if (line === "---" || /^\s/.test(line)) continue;
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_-]*):[ \t]*(.*)$/);
    if (!match) continue;
    const key = match[1];
    if (seen.has(key)) continue;
    seen.add(key);
    fields.push({ key, value: unquoteScalar(match[2]) });
  }
  return fields;
}

export function parseFrontmatterField(
  frontmatter: string,
  key: string
): string {
  const match = frontmatter.match(linePattern(key));
  if (!match) return "";
  return unquoteScalar(match[1]);
}

/**
 * Template keys always listed (empty if absent). Custom keys are anything
 * else except title/subtitle/spellcheck*.
 */
export function extraFrontmatterFields(frontmatter: string): {
  template: FrontmatterField[];
  custom: FrontmatterField[];
} {
  const parsed = parseFrontmatterFields(frontmatter);
  const byKey = new Map(parsed.map((field) => [field.key, field.value]));
  return {
    template: TEMPLATE_FRONTMATTER_KEYS.map((key) => ({
      key,
      value: byKey.get(key) ?? "",
    })),
    custom: parsed.filter(
      (field) =>
        !MAIN_UI_KEY_SET.has(field.key) &&
        !TEMPLATE_KEY_SET.has(field.key) &&
        !SETTINGS_KEY_SET.has(field.key)
    ),
  };
}

export function writeFrontmatterField(
  frontmatter: string,
  key: string,
  value: string,
  options?: { keepEmpty?: boolean; create?: boolean }
): string {
  const keepEmpty = options?.keepEmpty ?? isTemplateFrontmatterKey(key);
  const create = options?.create ?? false;
  const cleaned = value
    .replace(/\s+$/g, "")
    .trimStart()
    .replace(/\s*\n\s*/g, " ");
  const pattern = linePattern(key);
  const exists = Boolean(frontmatter) && pattern.test(frontmatter);
  const line = cleaned
    ? fieldLine(key, cleaned)
    : keepEmpty && (exists || create)
      ? `${key}:`
      : null;

  if (!frontmatter) {
    if (!line) return "";
    return `---\n${line}\n---\n`;
  }

  if (exists) {
    if (!line) {
      return frontmatter.replace(
        new RegExp(`\\n?${escapeRegExp(key)}:\\s*.*(?=\\n)`),
        ""
      );
    }
    return frontmatter.replace(pattern, line);
  }

  if (!line) return frontmatter;

  if (frontmatter.includes("\n---")) {
    return frontmatter.replace(/\n---\s*$/, `\n${line}\n---\n`);
  }
  return frontmatter.replace(/---\s*$/, `${line}\n---\n`);
}

export function removeFrontmatterField(
  frontmatter: string,
  key: string
): string {
  return writeFrontmatterField(frontmatter, key, "", { keepEmpty: false });
}
