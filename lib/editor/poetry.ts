import { Node, type JSONContent } from "@tiptap/core";
import {
  Fragment,
  Slice,
  type Mark,
  type Node as PmNode,
  type Schema,
} from "@tiptap/pm/model";
import { TextSelection, type EditorState, type Transaction } from "@tiptap/pm/state";

/**
 * Poetry block.
 *
 * On disk this is a fence, not an HTML tag:
 *
 *   :::poetry
 *   27All creatures look to You
 *     to give them their food in due season.
 *   :::
 *
 * Leading spaces and single newlines stay in the text (tight, like
 * Shift-Enter). Inline marks (*italic*, **bold**, <sup>, links, quotes)
 * are parsed per line so a verse can be both a poem and a quote.
 *
 * The editor and publication HTML render a real
 * `<div class="poetry" data-type="poetry">` with `white-space: pre-wrap`.
 * Rich-text copy/paste uses that element, so a sanitizer never has to
 * round-trip the `:::` marker. personal-site should recognize the fence
 * (see docs/MARKDOWN_SPEC.md).
 */

function matchFence(src: string): { raw: string; text: string } | null {
  if (!/^:::poetry[^\n]*\r?\n/.test(src)) return null;
  const close = /\n:::[ \t]*(?:\r?\n|$)/.exec(src);
  if (!close || close.index == null) return null;
  const openEnd = src.indexOf("\n") + 1;
  const body = src.slice(openEnd, close.index).replace(/\r\n/g, "\n");
  return {
    raw: src.slice(0, close.index + close[0].length),
    text: body,
  };
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    poetry: {
      togglePoetry: () => ReturnType;
    };
  }
}

function poetryDepth($pos: EditorState["selection"]["$from"]): number {
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    if ($pos.node(depth).type.name === "poetry") return depth;
  }
  return -1;
}

function sameMarks(
  a: JSONContent["marks"] | undefined,
  b: JSONContent["marks"] | undefined
): boolean {
  return JSON.stringify(a ?? []) === JSON.stringify(b ?? []);
}

function pushText(
  content: JSONContent[],
  text: string,
  marks?: JSONContent["marks"]
) {
  if (!text) return;
  const last = content[content.length - 1];
  if (last?.type === "text" && sameMarks(last.marks, marks)) {
    last.text = `${last.text ?? ""}${text}`;
    return;
  }
  const node: JSONContent = { type: "text", text };
  if (marks && marks.length > 0) node.marks = marks;
  content.push(node);
}

function appendParsed(
  content: JSONContent[],
  nodes: JSONContent[]
) {
  for (const node of nodes) {
    if (node.type === "hardBreak") {
      pushText(content, "\n");
      continue;
    }
    if (node.type === "text") {
      pushText(content, node.text ?? "", node.marks);
      continue;
    }
    content.push(node);
  }
}

function isPoetryTag(tag: string, attrs: string): boolean {
  if (tag !== "div" && tag !== "pre") return false;
  if (/\bdata-type\s*=\s*["']poetry["']/i.test(attrs)) return true;
  const classMatch = attrs.match(/\bclass\s*=\s*(["'])([\s\S]*?)\1/i);
  if (!classMatch) return false;
  return classMatch[2].split(/\s+/).includes("poetry");
}

/**
 * Pretty-printed poetry HTML often wraps the text in newlines and `<br>`.
 * Keep inline tags (`<sup>`, `<em>`, links) for the inline lexer.
 */
function prepareHtmlInner(inner: string): string {
  let text = inner.replace(/\r\n/g, "\n");
  text = text.replace(/<br\s*\/?>/gi, "\n");
  text = text.replace(/<\/p>\s*<p\b[^>]*>/gi, "\n");
  text = text.replace(/<\/?p\b[^>]*>/gi, "");
  text = text.replace(/&nbsp;|&#160;|&#x0*a0;/gi, " ");
  if (text.startsWith("\n")) text = text.slice(1);
  if (text.endsWith("\n")) text = text.slice(0, -1);
  return text;
}

function matchHtmlPoetry(src: string): { raw: string; text: string } | null {
  const open = /^<(div|pre)\b([^>]*)>/i.exec(src);
  if (!open) return null;
  const tag = open[1].toLowerCase();
  if (!isPoetryTag(tag, open[2] ?? "")) return null;
  const rest = src.slice(open[0].length);
  const closeRe = new RegExp(`</${tag}>[ \\t]*(?:\\r?\\n|$)`, "i");
  const close = closeRe.exec(rest);
  if (!close || close.index == null) return null;
  const raw = src.slice(0, open[0].length + close.index + close[0].length);
  return { raw, text: prepareHtmlInner(rest.slice(0, close.index)) };
}

function contentFromBody(
  body: string,
  tokenizeLine: (line: string) => JSONContent[]
): JSONContent[] {
  const content: JSONContent[] = [];
  const lines = body.split("\n");
  lines.forEach((line, index) => {
    if (index > 0) pushText(content, "\n");
    const lead = /^[ \t]*/.exec(line)?.[0] ?? "";
    const rest = line.slice(lead.length);
    if (lead) pushText(content, lead);
    if (rest) appendParsed(content, tokenizeLine(rest));
  });
  return content;
}

function renderPoetryBody(
  nodes: JSONContent[],
  renderLine: (line: JSONContent[]) => string
): string {
  const lines: JSONContent[][] = [[]];
  for (const child of nodes) {
    if (child.type === "hardBreak") {
      lines.push([]);
      continue;
    }
    if (child.type === "text" && child.text?.includes("\n")) {
      const parts = child.text.split("\n");
      parts.forEach((part, index) => {
        if (index > 0) lines.push([]);
        if (part) {
          lines[lines.length - 1]?.push({ ...child, text: part });
        }
      });
      continue;
    }
    lines[lines.length - 1]?.push(child);
  }
  return lines.map((line) => renderLine(line)).join("\n");
}

function marksEqual(a: readonly Mark[], b: readonly Mark[]): boolean {
  return a.length === b.length && a.every((mark, index) => mark.eq(b[index]!));
}

function mergeInline(nodes: PmNode[]): PmNode[] {
  const merged: PmNode[] = [];
  for (const node of nodes) {
    const prev = merged[merged.length - 1];
    if (
      prev?.isText &&
      node.isText &&
      prev.text &&
      node.text &&
      marksEqual(prev.marks, node.marks)
    ) {
      merged[merged.length - 1] = node.type.schema.text(
        prev.text + node.text,
        prev.marks
      );
      continue;
    }
    merged.push(node);
  }
  return merged;
}

function blocksToPoetry(blocks: PmNode[], schema: Schema): PmNode {
  const chunks: PmNode[] = [];
  blocks.forEach((block, index) => {
    if (index > 0) chunks.push(schema.text("\n"));
    block.forEach((child) => {
      if (child.type.name === "hardBreak") {
        chunks.push(schema.text("\n"));
        return;
      }
      if (child.isText) {
        if (child.text) chunks.push(child);
        return;
      }
      if (child.isInline) chunks.push(child);
    });
  });
  const merged = mergeInline(chunks);
  return schema.nodes.poetry.create(
    null,
    merged.length > 0 ? merged : undefined
  );
}

function poetryToBlocks(poetry: PmNode, schema: Schema): PmNode[] {
  const lines: PmNode[][] = [[]];
  poetry.forEach((child) => {
    if (child.type.name === "hardBreak") {
      lines.push([]);
      return;
    }
    if (child.isText && child.text?.includes("\n")) {
      const parts = child.text.split("\n");
      parts.forEach((part, index) => {
        if (index > 0) lines.push([]);
        if (part) lines[lines.length - 1]?.push(schema.text(part, child.marks));
      });
      return;
    }
    if ((child.isText && child.text) || child.isInline) {
      lines[lines.length - 1]?.push(child);
    }
  });
  if (lines.length === 0) {
    return [schema.nodes.paragraph.create()];
  }
  return lines.map((content) =>
    schema.nodes.paragraph.create(null, content.length > 0 ? content : undefined)
  );
}

function paragraphRange(
  state: EditorState
): { from: number; to: number; blocks: PmNode[] } | null {
  const { $from, $to } = state.selection;
  if (poetryDepth($from) >= 0) return null;
  const range = $from.blockRange($to);
  if (range) {
    const blocks: PmNode[] = [];
    let ok = range.endIndex > range.startIndex;
    for (let index = range.startIndex; index < range.endIndex; index += 1) {
      const child = range.parent.child(index);
      if (child.type.name !== "paragraph" && child.type.name !== "heading") {
        ok = false;
        break;
      }
      blocks.push(child);
    }
    if (ok && blocks.length > 0) {
      return { from: range.start, to: range.end, blocks };
    }
  }
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth);
    if (node.type.name === "codeBlock") return null;
    if (node.type.name === "paragraph" || node.type.name === "heading") {
      return {
        from: $from.before(depth),
        to: $from.after(depth),
        blocks: [node],
      };
    }
  }
  return null;
}

function insertPoetryNewline(
  state: EditorState,
  dispatch?: (tr: Transaction) => void
): boolean {
  if (state.selection.$from.parent.type.name !== "poetry") return false;
  if (dispatch) dispatch(state.tr.insertText("\n").scrollIntoView());
  return true;
}

function exitPoetry(
  state: EditorState,
  dispatch?: (tr: Transaction) => void
): boolean {
  const depth = poetryDepth(state.selection.$from);
  if (depth < 0) return false;
  const after = state.selection.$from.after(depth);
  if (dispatch) {
    const paragraph = state.schema.nodes.paragraph.create();
    let tr = state.tr.insert(after, paragraph);
    tr = tr.setSelection(TextSelection.near(tr.doc.resolve(after + 1)));
    dispatch(tr.scrollIntoView());
  }
  return true;
}

function clearEmptyPoetry(
  state: EditorState,
  dispatch?: (tr: Transaction) => void
): boolean {
  const { empty, $from } = state.selection;
  if (!empty || $from.parent.type.name !== "poetry") return false;
  if ($from.parent.content.size > 0) return false;
  const from = $from.before();
  if (dispatch) {
    const paragraph = state.schema.nodes.paragraph.create();
    let tr = state.tr.replaceWith(from, $from.after(), paragraph);
    tr = tr.setSelection(TextSelection.near(tr.doc.resolve(from + 1)));
    dispatch(tr.scrollIntoView());
  }
  return true;
}

function indentPoetry(
  state: EditorState,
  dispatch?: (tr: Transaction) => void
): boolean {
  if (state.selection.$from.parent.type.name !== "poetry") return false;
  if (dispatch) dispatch(state.tr.insertText("  ").scrollIntoView());
  return true;
}

function outdentPoetry(
  state: EditorState,
  dispatch?: (tr: Transaction) => void
): boolean {
  const { $from, empty } = state.selection;
  if (!empty || $from.parent.type.name !== "poetry") return false;
  const text = $from.parent.textContent;
  const lineStart = text.lastIndexOf("\n", Math.max(0, $from.parentOffset - 1)) + 1;
  const line = text.slice(lineStart);
  const indent = /^(?: {1,2}|\t)/.exec(line);
  if (!indent) return true;
  const from = $from.start() + lineStart;
  if (dispatch) {
    dispatch(state.tr.delete(from, from + indent[0].length).scrollIntoView());
  }
  return true;
}

/** Plain-text paste inside a poem keeps indents and line breaks. */
export function sliceFromPoetryPlainText(schema: Schema, text: string): Slice {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (!normalized) return Slice.empty;
  return new Slice(Fragment.from(schema.text(normalized)), 0, 0);
}

export const Poetry = Node.create({
  name: "poetry",
  group: "block",
  content: "inline*",
  defining: true,
  // Keep spaces and newlines in the text. Do not set `code`: that would
  // forbid italic, superscript, links, and smart quotes.
  whitespace: "pre",

  parseHTML() {
    return [
      {
        tag: "div[data-type='poetry']",
        priority: 60,
        preserveWhitespace: "full",
      },
      { tag: "div.poetry", priority: 60, preserveWhitespace: "full" },
      { tag: "pre.poetry", priority: 60, preserveWhitespace: "full" },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      {
        ...HTMLAttributes,
        class: "poetry",
        "data-type": "poetry",
        style: "white-space: pre-wrap",
      },
      0,
    ];
  },

  addCommands() {
    return {
      togglePoetry:
        () =>
        ({ state, dispatch }) => {
          const depth = poetryDepth(state.selection.$from);
          if (depth >= 0) {
            const node = state.selection.$from.node(depth);
            const from = state.selection.$from.before(depth);
            const blocks = poetryToBlocks(node, state.schema);
            if (dispatch) {
              let tr = state.tr.replaceWith(from, state.selection.$from.after(depth), blocks);
              tr = tr.setSelection(TextSelection.near(tr.doc.resolve(from + 1)));
              dispatch(tr.scrollIntoView());
            }
            return true;
          }
          const target = paragraphRange(state);
          if (!target) return false;
          const poetry = blocksToPoetry(target.blocks, state.schema);
          if (dispatch) {
            let tr = state.tr.replaceWith(target.from, target.to, poetry);
            tr = tr.setSelection(
              TextSelection.near(tr.doc.resolve(Math.min(target.from + 1, tr.doc.content.size)))
            );
            dispatch(tr.scrollIntoView());
          }
          return true;
        },
    };
  },

  addKeyboardShortcuts() {
    return {
      Enter: () =>
        this.editor.commands.command(({ state, dispatch }) =>
          insertPoetryNewline(state, dispatch)
        ),
      "Shift-Enter": () =>
        this.editor.commands.command(({ state, dispatch }) =>
          insertPoetryNewline(state, dispatch)
        ),
      "Mod-Enter": () =>
        this.editor.commands.command(({ state, dispatch }) =>
          exitPoetry(state, dispatch)
        ),
      Backspace: () =>
        this.editor.commands.command(({ state, dispatch }) =>
          clearEmptyPoetry(state, dispatch)
        ),
      Tab: () =>
        this.editor.commands.command(({ state, dispatch }) =>
          indentPoetry(state, dispatch)
        ),
      "Shift-Tab": () =>
        this.editor.commands.command(({ state, dispatch }) =>
          outdentPoetry(state, dispatch)
        ),
    };
  },

  markdownTokenName: "poetry",

  markdownTokenizer: {
    name: "poetry",
    level: "block",
    start: (src: string) => {
      const fence = src.indexOf(":::poetry");
      const div = src.search(/<(?:div|pre)\b[^>]*\bpoetry\b/i);
      const hits = [fence, div].filter((index) => index >= 0);
      if (hits.length === 0) return -1;
      return Math.min(...hits);
    },
    tokenize: (src: string) => {
      const fenced = matchFence(src);
      if (fenced) {
        return {
          type: "poetry",
          raw: fenced.raw,
          text: fenced.text,
        };
      }
      const html = matchHtmlPoetry(src);
      if (!html) return undefined;
      return {
        type: "poetry",
        raw: html.raw,
        text: html.text,
      };
    },
  },

  parseMarkdown: (token, helpers) => {
    const body = typeof token.text === "string" ? token.text : "";
    const tokenizeLine = (line: string): JSONContent[] => {
      const tokenize = helpers.tokenizeInline;
      if (!tokenize) return line ? [{ type: "text", text: line }] : [];
      return helpers.parseInline(tokenize(line));
    };
    const content = contentFromBody(body, tokenizeLine);
    return content.length > 0
      ? { type: "poetry", content }
      : { type: "poetry" };
  },

  renderMarkdown: (node, helpers) => {
    const body = renderPoetryBody(node.content ?? [], (line) =>
      line.length > 0 ? helpers.renderChildren(line) : ""
    );
    return `:::poetry\n${body}\n:::`;
  },
});
