import type { JSONContent } from "@tiptap/core";

const BOLD_MARKDOWN_RE = /\*\*([^*\n]+)\*\*/g;
const ITALIC_MARKDOWN_RE = /\*([^*\n]+)\*/g;
const WHITESPACE_RE = /^\s$/u;
const PUNCTUATION_RE = /^\p{P}$/u;

function isWhitespace(character: string | undefined): boolean {
  return !character || WHITESPACE_RE.test(character);
}

function isPunctuation(character: string | undefined): boolean {
  return Boolean(character && PUNCTUATION_RE.test(character));
}

function isPunctuationOnly(value: string): boolean {
  return value.length > 0 && Array.from(value).every(isPunctuation);
}

function isLeftFlanking(
  before: string | undefined,
  after: string | undefined
): boolean {
  return (
    !isWhitespace(after) &&
    (!isPunctuation(after) || isWhitespace(before) || isPunctuation(before))
  );
}

function isRightFlanking(
  before: string | undefined,
  after: string | undefined
): boolean {
  return (
    !isWhitespace(before) &&
    (!isPunctuation(before) || isWhitespace(after) || isPunctuation(after))
  );
}

/**
 * CommonMark emphasis delimiters must flank their neighboring characters.
 * Emit HTML when punctuation-only content would turn literal on re-parse.
 */
function canUseMarkdownDelimiters(
  content: string,
  before: string | undefined,
  after: string | undefined
): boolean {
  const characters = Array.from(content);
  const first = characters[0];
  const last = characters.at(-1);
  return (
    isLeftFlanking(before, first) &&
    isRightFlanking(last, after)
  );
}

function markedText(doc: JSONContent, markType: "bold" | "italic"): Set<string> {
  const values = new Set<string>();
  const visit = (node: JSONContent) => {
    if (
      node.type === "text" &&
      node.text &&
      node.marks?.some((mark) => mark.type === markType)
    ) {
      values.add(node.text);
    }
    node.content?.forEach(visit);
  };
  visit(doc);
  return values;
}

/**
 * TipTap's default mark serializer emits `*…*` / `**…**`. It cannot inspect
 * adjacent text while rendering an individual mark, so rewrite only emitted
 * punctuation-only marks whose delimiters would become literal on re-parse.
 */
export function preserveUnstableEmphasis(
  markdown: string,
  doc: JSONContent
): string {
  const replaceUnstable = (
    pattern: RegExp,
    markType: "bold" | "italic",
    tag: "em" | "strong"
  ): string => {
    const values = markedText(doc, markType);
    return markdown.replace(
      pattern,
      (raw, content: string, offset: number) => {
        if (!isPunctuationOnly(content) || !values.has(content)) return raw;
        const before = markdown.slice(0, offset).at(-1);
        const after = markdown.at(offset + raw.length);
        return canUseMarkdownDelimiters(content, before, after)
          ? raw
          : `<${tag}>${content}</${tag}>`;
      }
    );
  };

  const withBold = replaceUnstable(BOLD_MARKDOWN_RE, "bold", "strong");
  return withBold.replace(
    ITALIC_MARKDOWN_RE,
    (raw, content: string, offset: number) => {
      const values = markedText(doc, "italic");
      if (!isPunctuationOnly(content) || !values.has(content)) return raw;
      const before = withBold.slice(0, offset).at(-1);
      const after = withBold.at(offset + raw.length);
      return canUseMarkdownDelimiters(content, before, after)
        ? raw
        : `<em>${content}</em>`;
    }
  );
}
