import OrderedList from "@tiptap/extension-ordered-list";
import { wrappingInputRule } from "@tiptap/core";
import { Plugin } from "@tiptap/pm/state";

/** Digits only — TipTap stock also treats `[a-zA-Z]{1,2}.` (so `St.` → list). */
const NUMERIC_ORDERED_ITEM_RE = /^(\s*)(\d+)([.)])\s+(.*)$/;
const NUMERIC_PLAIN_LINE_RE = /^(\d+)([.)])\s+(.+)$/;
const INDENTED_LINE_RE = /^\s/;

type CollectedItem = {
  indent: number;
  number: number;
  contentLines: string[];
  raw: string;
};

function collectNumericOrderedListItems(
  lines: string[]
): [CollectedItem[], number] {
  const listItems: CollectedItem[] = [];
  let currentLineIndex = 0;
  let consumed = 0;

  while (currentLineIndex < lines.length) {
    const line = lines[currentLineIndex] ?? "";
    const match = line.match(NUMERIC_ORDERED_ITEM_RE);
    if (!match) break;

    const indent = match[1] ?? "";
    const marker = match[2] ?? "1";
    const content = match[4] ?? "";
    const indentLevel = indent.length;
    const itemNumber = parseInt(marker, 10);
    const itemContentLines = [content];
    const itemLines = [line];
    let nextLineIndex = currentLineIndex + 1;
    let sawBlankLine = false;

    while (nextLineIndex < lines.length) {
      const nextLine = lines[nextLineIndex] ?? "";
      if (nextLine.match(NUMERIC_ORDERED_ITEM_RE)) break;
      if (nextLine.trim() === "") {
        itemLines.push(nextLine);
        itemContentLines.push("");
        sawBlankLine = true;
        nextLineIndex += 1;
      } else if (INDENTED_LINE_RE.test(nextLine)) {
        const leadingWhitespace =
          nextLine.length - nextLine.trimStart().length;
        const contentIndent = indentLevel + marker.length + 1;
        itemLines.push(nextLine);
        itemContentLines.push(
          nextLine.slice(Math.min(leadingWhitespace, contentIndent))
        );
        nextLineIndex += 1;
      } else {
        if (sawBlankLine) break;
        // Lazy continuation: stop before headings / bullets / fences.
        if (/^(?:#{1,6}\s|[-+*]\s|```|~~~|>\s?)/.test(nextLine.trimStart())) {
          break;
        }
        itemLines.push(nextLine);
        itemContentLines.push(nextLine);
        nextLineIndex += 1;
      }
    }

    listItems.push({
      indent: indentLevel,
      number: itemNumber,
      contentLines: itemContentLines,
      raw: itemLines.join("\n"),
    });
    consumed = nextLineIndex;
    currentLineIndex = nextLineIndex;
  }

  return [listItems, consumed];
}

function buildNestedStructure(
  items: CollectedItem[],
  baseIndent: number,
  lexer: {
    inlineTokens: (src: string) => unknown[];
    blockTokens: (src: string) => unknown[];
  }
): Array<Record<string, unknown>> {
  const result: Array<Record<string, unknown>> = [];
  let currentIndex = 0;

  while (currentIndex < items.length) {
    const item = items[currentIndex];
    if (!item) break;
    if (item.indent !== baseIndent) {
      currentIndex += 1;
      continue;
    }

    const paragraphLines: string[] = [];
    const blockLines: string[] = [];
    let reachedBlock = false;
    for (const line of item.contentLines) {
      if (reachedBlock) {
        blockLines.push(line);
        continue;
      }
      if (line.trim() === "") {
        reachedBlock = true;
        blockLines.push(line);
        continue;
      }
      paragraphLines.push(line);
    }

    const mainText = paragraphLines.join("\n").trim();
    const tokens: unknown[] = [];
    if (mainText) {
      tokens.push({
        type: "paragraph",
        raw: mainText,
        tokens: lexer.inlineTokens(mainText),
      });
    }
    const additional = blockLines.join("\n").trim();
    if (additional) {
      tokens.push(...lexer.blockTokens(additional));
    }

    let lookAhead = currentIndex + 1;
    const nested: CollectedItem[] = [];
    while (lookAhead < items.length && (items[lookAhead]?.indent ?? 0) > baseIndent) {
      nested.push(items[lookAhead]!);
      lookAhead += 1;
    }
    if (nested.length > 0) {
      const nextIndent = Math.min(...nested.map((n) => n.indent));
      tokens.push({
        type: "list",
        ordered: true,
        start: nested[0]?.number ?? 1,
        items: buildNestedStructure(nested, nextIndent, lexer),
        raw: nested.map((n) => n.raw).join("\n"),
      });
    }

    result.push({
      type: "list_item",
      raw: item.raw,
      tokens,
    });
    currentIndex = lookAhead;
  }

  return result;
}

function parseNumericPlainTextOrderedListPaste(text: string) {
  const lines = text.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length === 0) return null;

  const parsed: { marker: number; content: string }[] = [];
  for (const line of lines) {
    const match = line.trim().match(NUMERIC_PLAIN_LINE_RE);
    if (!match) return null;
    parsed.push({
      marker: parseInt(match[1] ?? "1", 10),
      content: match[3] ?? "",
    });
  }

  const start = parsed[0]?.marker ?? 1;
  for (let i = 0; i < parsed.length; i++) {
    if (parsed[i]?.marker !== start + i) return null;
  }

  return {
    type: "orderedList",
    attrs: start === 1 ? {} : { start },
    content: parsed.map((item) => ({
      type: "listItem",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: item.content }],
        },
      ],
    })),
  };
}

/**
 * Only auto-convert `1. ` into an ordered list. Typing `123. ` (etc.) stays
 * plain text so large numbers aren't trapped in an uneditable CSS marker.
 * Markdown that already uses `start` still round-trips via attrs.
 *
 * Markdown tokenization is digits-only: TipTap stock also accepts 1–2 letter
 * markers (`a.` / `St.`), which corrupts prose like "St. George…".
 */
export const StrictOrderedList = OrderedList.extend({
  addInputRules() {
    return [
      wrappingInputRule({
        find: /^1\.\s$/,
        type: this.type,
        getAttributes: () => ({ start: 1 }),
      }),
    ];
  },

  markdownTokenizer: {
    name: "orderedList",
    level: "block",
    // Same as TipTap stock: marked already breaks before start-of-line markers;
    // probing mid-line must not start a list (phone numbers, etc.).
    start: () => -1,
    tokenize(src, _tokens, lexer) {
      const lines = src.split("\n");
      const [listItems, consumed] = collectNumericOrderedListItems(lines);
      if (listItems.length === 0) return undefined;
      const items = buildNestedStructure(
        listItems,
        listItems[0]?.indent ?? 0,
        lexer as {
          inlineTokens: (s: string) => unknown[];
          blockTokens: (s: string) => unknown[];
        }
      );
      if (items.length === 0) return undefined;
      return {
        type: "list",
        ordered: true,
        start: listItems[0]?.number ?? 1,
        items,
        raw: lines.slice(0, consumed).join("\n"),
      };
    },
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          handlePaste: (view, event) => {
            const html = event.clipboardData?.getData("text/html");
            if (html?.trim()) return false;
            const text = event.clipboardData?.getData("text/plain");
            if (!text) return false;
            const orderedListContent = parseNumericPlainTextOrderedListPaste(text);
            if (!orderedListContent) return false;
            try {
              const orderedListNode =
                view.state.schema.nodeFromJSON(orderedListContent);
              const tr = view.state.tr.replaceSelectionWith(orderedListNode);
              view.dispatch(tr.scrollIntoView());
              return true;
            } catch {
              return false;
            }
          },
        },
      }),
    ];
  },
});
