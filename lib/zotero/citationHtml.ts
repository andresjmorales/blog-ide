/**
 * Zotero `citation` / `bib` fields are CSL HTML. Strip to markdown-ish
 * plain text so footnotes match the editor (*italics*, quotes, en dashes).
 * Never insert raw XHTML into the essay.
 */

const BLOCK_BREAK_RE = /<\/(p|div|li|h[1-6]|tr)>/gi;
const BR_RE = /<br\s*\/?>/gi;
const ITALIC_OPEN_RE = /<\s*(i|em)(\s[^>]*)?>/gi;
const ITALIC_CLOSE_RE = /<\s*\/\s*(i|em)\s*>/gi;
const BOLD_OPEN_RE = /<\s*(b|strong)(\s[^>]*)?>/gi;
const BOLD_CLOSE_RE = /<\s*\/\s*(b|strong)\s*>/gi;
const TAG_RE = /<[^>]+>/g;
const ENTITY_RE = /&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g;

const NAMED: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  hellip: "…",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
};

function decodeEntity(raw: string): string {
  const name = raw.slice(1, -1);
  if (name[0] === "#") {
    const hex = name[1] === "x" || name[1] === "X";
    const code = Number.parseInt(hex ? name.slice(2) : name.slice(1), hex ? 16 : 10);
    if (Number.isFinite(code) && code > 0) {
      try {
        return String.fromCodePoint(code);
      } catch {
        return "";
      }
    }
    return "";
  }
  return NAMED[name] ?? raw;
}

export function citationHtmlToPlain(html: string): string {
  if (!html) return "";
  let text = html.replace(BLOCK_BREAK_RE, "\n").replace(BR_RE, "\n");
  text = text.replace(ITALIC_OPEN_RE, "*").replace(ITALIC_CLOSE_RE, "*");
  text = text.replace(BOLD_OPEN_RE, "**").replace(BOLD_CLOSE_RE, "**");
  text = text.replace(TAG_RE, "");
  text = text.replace(ENTITY_RE, (entity) => decodeEntity(entity));
  return text
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}
