import {
  type Editor,
  Extension,
  Node,
  mergeAttributes,
  type JSONContent,
} from "@tiptap/core";
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import katex from "katex";

/** base64url — same scheme as image captions. */
export function encodeMath(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const base64 =
    typeof btoa === "function"
      ? btoa(binary)
      : Buffer.from(bytes).toString("base64");
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeMath(value: string): string {
  if (!value) return "";
  const padded = value + "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = padded.replace(/-/g, "+").replace(/_/g, "/");
  try {
    const binary =
      typeof atob === "function"
        ? atob(base64)
        : Buffer.from(base64, "base64").toString("binary");
    const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return "";
  }
}

/** Fenced blocks and inline code spans — never rewrite math inside these. */
const CODE_RE = /(```[\s\S]*?(?:```|$)|~~~[\s\S]*?(?:~~~|$)|`[^`\n]*`)/g;

/**
 * LaTeX's `\[…\]` / `\(…\)` delimiters (common in AI output and copied
 * notes) would parse as bare brackets (`\[` is an escaped `[`). Rewrite them
 * to the `$$…$$` / `$…$` forms `prepareMath` understands, leaving code alone.
 */
export function normalizeLatexDelimiters(text: string): string {
  if (!text.includes("\\[") && !text.includes("\\(")) return text;
  return text
    .split(CODE_RE)
    .map((part, index) => {
      // Odd indexes are the captured code segments.
      if (index % 2 === 1) return part;
      return part
        .replace(/\\\[([\s\S]+?)\\\]/g, (_raw, latex: string) => `\n$$${latex.trim()}$$\n`)
        .replace(/\\\(([\s\S]+?)\\\)/g, (_raw, latex: string) => `$${latex.trim()}$`);
    })
    .join("");
}

const BLOCK_MATH_RE = /\$\$([\s\S]+?)\$\$/g;

/** Currency-ish / price-range bodies — not math (e.g. `1-` from `$1-$2`). */
const CURRENCY_LIKE_BODY = /^[\d.,\-]+$/;

function isPlausibleInlineMath(latex: string): boolean {
  if (!latex || /^\s|\s$/.test(latex)) return false;
  if (CURRENCY_LIKE_BODY.test(latex)) return false;
  return true;
}

/**
 * Fold `$…$` / `$$…$$` into TipTap-parseable sentinels. Block math first so
 * display delimiters are not eaten by the inline pass.
 *
 * Inline `$` is conservative: skip currency-like bodies (digits / `-` / `,` /
 * `.` only) and Pandoc-style “`$` followed by a digit is not a closer”
 * so `$1-$2` stays literal while `$x^2$` / `$1+2$` still fold.
 */
export function prepareMath(body: string): string {
  const next = body.replace(BLOCK_MATH_RE, (_raw, latex: string) => {
    // Own line so the block tokenizer can claim it; avoid extra blank lines
    // that become empty paragraphs / &nbsp; on serialize.
    return `\n[[blogide-math-b:${encodeMath(latex.trim())}]]\n`;
  });

  let out = "";
  let i = 0;
  while (i < next.length) {
    if (next[i] !== "$") {
      out += next[i];
      i += 1;
      continue;
    }
    // Opening `$` must be followed by a non-space, non-`$`.
    const afterOpen = next[i + 1];
    if (!afterOpen || afterOpen === "$" || /\s/.test(afterOpen)) {
      out += "$";
      i += 1;
      continue;
    }
    let j = i + 1;
    let closed = -1;
    while (j < next.length) {
      const ch = next[j];
      if (ch === "\n") break;
      if (ch === "$") {
        const before = next[j - 1];
        const after = next[j + 1];
        // Closing `$` may not be preceded by whitespace or followed by a digit.
        if (before && !/\s/.test(before) && !(after && /\d/.test(after))) {
          closed = j;
          break;
        }
        // `$` followed by a digit is currency, not a closer — keep scanning.
        j += 1;
        continue;
      }
      j += 1;
    }
    if (closed < 0) {
      out += "$";
      i += 1;
      continue;
    }
    const latex = next.slice(i + 1, closed);
    if (!isPlausibleInlineMath(latex)) {
      out += "$";
      i += 1;
      continue;
    }
    out += `[[blogide-math-i:${encodeMath(latex)}]]`;
    i = closed + 1;
  }
  return out;
}

/**
 * KaTeX stylesheet matching the bundled renderer. Class names change between
 * KaTeX releases (e.g. `stretchy` → `katex-stretchy`), so standalone pages must
 * load the CSS for the same version or `\boxed{}` / arrows render invisibly.
 */
export const KATEX_CSS_URL = `https://cdn.jsdelivr.net/npm/katex@${katex.version}/dist/katex.min.css`;

export function renderLatexHtml(
  latex: string,
  displayMode: boolean
): { html: string; error: string | null } {
  try {
    return {
      html: katex.renderToString(latex, {
        displayMode,
        throwOnError: false,
        strict: "ignore",
      }),
      error: null,
    };
  } catch (err) {
    return {
      html: "",
      error: err instanceof Error ? err.message : "Invalid LaTeX",
    };
  }
}

/**
 * Math nodes just inserted by a command: their node view opens the LaTeX
 * editor with the placeholder selected. Keyed by node identity, which a
 * ProseMirror insert keeps.
 */
const autoOpenNodes = new WeakSet<object>();

/** True once for a node inserted by `insertInlineMath` / `insertBlockMath`. */
export function takeMathAutoOpen(node: object): boolean {
  if (!autoOpenNodes.has(node)) return false;
  // Deferred so StrictMode's double-invoked state initializer sees it too.
  setTimeout(() => autoOpenNodes.delete(node), 0);
  return true;
}

/**
 * Insert math from a shortcut: the selected text becomes its LaTeX (spaces
 * around the selection stay in the sentence); otherwise the placeholder.
 */
function insertMathFromSelection(editor: Editor, display: boolean): boolean {
  const { from, to, empty } = editor.state.selection;
  const raw = empty ? "" : editor.state.doc.textBetween(from, to, " ");
  const latex = raw.trim();
  const chain = editor.chain();
  if (latex && raw.length === to - from) {
    const lead = raw.length - raw.trimStart().length;
    const trail = raw.length - raw.trimEnd().length;
    chain.setTextSelection({ from: from + lead, to: to - trail });
  }
  const text = latex || undefined;
  return (display ? chain.insertBlockMath(text) : chain.insertInlineMath(text)).run();
}

/**
 * Browsers can't hold (or draw) a caret right before a non-editable inline
 * node with no text before it — e.g. math at the start of a line — so arrow
 * keys bounce past it and there's no way to type in front of it. Step over
 * inline math explicitly and draw our own caret in that spot.
 */
function inlineMathCaretPlugin(typeName: string): Plugin {
  const isMath = (node: { type: { name: string } } | null | undefined) =>
    node?.type.name === typeName;
  return new Plugin({
    key: new PluginKey("inlineMathCaret"),
    props: {
      handleKeyDown(view, event) {
        if (event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) {
          return false;
        }
        const { selection } = view.state;
        if (!selection.empty) return false;
        const { $from } = selection;
        let target: number | null = null;
        if (event.key === "ArrowLeft" && isMath($from.nodeBefore)) {
          target = $from.pos - 1;
        } else if (event.key === "ArrowRight" && isMath($from.nodeAfter)) {
          target = $from.pos + 1;
        }
        if (target === null) return false;
        view.dispatch(
          view.state.tr.setSelection(TextSelection.create(view.state.doc, target))
        );
        return true;
      },
      decorations(state) {
        const { selection } = state;
        if (!selection.empty) return null;
        const { $from } = selection;
        if (!isMath($from.nodeAfter) || $from.nodeBefore?.isText) return null;
        const caret = document.createElement("span");
        caret.className = "blogide-math-caret";
        return DecorationSet.create(state.doc, [
          Decoration.widget($from.pos, caret, { side: -1, key: "math-caret" }),
        ]);
      },
    },
  });
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    math: {
      insertInlineMath: (latex?: string) => ReturnType;
      insertBlockMath: (latex?: string) => ReturnType;
    };
  }
}

export const InlineMath = Node.create({
  name: "inlineMath",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      latex: { default: "" },
    };
  },

  parseHTML() {
    return [
      {
        tag: "span[data-inline-math]",
        getAttrs: (el) => {
          if (!(el instanceof HTMLElement)) return false;
          return { latex: el.getAttribute("data-latex") || "" };
        },
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-inline-math": "",
        "data-latex": node.attrs.latex || "",
        class: "blogide-inline-math",
      }),
    ];
  },

  renderMarkdown(node: JSONContent) {
    return `$${String(node.attrs?.latex ?? "")}$`;
  },

  addProseMirrorPlugins() {
    return [inlineMathCaretPlugin(this.name)];
  },

  addKeyboardShortcuts() {
    return {
      "Mod-Shift-e": () => insertMathFromSelection(this.editor, false),
    };
  },

  addCommands() {
    return {
      insertInlineMath:
        (latex = "x") =>
        ({ commands }) => {
          const node = this.type.create({ latex });
          autoOpenNodes.add(node);
          return commands.insertContent(node);
        },
    };
  },
});

export const BlockMath = Node.create({
  name: "blockMath",
  group: "block",
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      latex: { default: "" },
    };
  },

  parseHTML() {
    return [
      {
        tag: "div[data-block-math]",
        getAttrs: (el) => {
          if (!(el instanceof HTMLElement)) return false;
          return { latex: el.getAttribute("data-latex") || "" };
        },
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-block-math": "",
        "data-latex": node.attrs.latex || "",
        class: "blogide-block-math",
      }),
    ];
  },

  renderMarkdown(node: JSONContent) {
    const latex = String(node.attrs?.latex ?? "").trim();
    // Compact single-line form avoids inventing newlines (lossy on source toggle).
    // TipTap already joins blocks with \n\n — do not append a trailing newline.
    if (!latex.includes("\n")) return `$$${latex}$$`;
    return `$$\n${latex}\n$$`;
  },

  addKeyboardShortcuts() {
    return {
      "Mod-Shift-d": () => insertMathFromSelection(this.editor, true),
    };
  },

  addCommands() {
    return {
      insertBlockMath:
        (latex = "x^2") =>
        ({ commands }) => {
          const node = this.type.create({ latex });
          autoOpenNodes.add(node);
          return commands.insertContent(node);
        },
    };
  },
});

/** Inline sentinel → inlineMath node. */
export const MathInlineMarkdown = Extension.create({
  name: "mathMarkdownInline",
  markdownTokenName: "blogideMathI",
  markdownTokenizer: {
    name: "blogideMathI",
    level: "inline",
    start(src: string) {
      return src.indexOf("[[blogide-math-i:");
    },
    tokenize(src: string) {
      const match = src.match(/^\[\[blogide-math-i:([A-Za-z0-9_-]+)\]\]/);
      if (!match) return undefined;
      return {
        type: "blogideMathI",
        raw: match[0],
        latex: decodeMath(match[1] ?? ""),
      };
    },
  },
  parseMarkdown(token, helpers) {
    return helpers.createNode("inlineMath", {
      latex: typeof token.latex === "string" ? token.latex : "",
    });
  },
});

/** Block sentinel → blockMath node. */
export const MathBlockMarkdown = Extension.create({
  name: "mathMarkdownBlock",
  markdownTokenName: "blogideMathB",
  markdownTokenizer: {
    name: "blogideMathB",
    level: "block",
    start(src: string) {
      return src.indexOf("[[blogide-math-b:");
    },
    tokenize(src: string) {
      const match = src.match(/^\[\[blogide-math-b:([A-Za-z0-9_-]+)\]\]/);
      if (!match) return undefined;
      return {
        type: "blogideMathB",
        raw: match[0],
        latex: decodeMath(match[1] ?? ""),
      };
    },
  },
  parseMarkdown(token, helpers) {
    return helpers.createNode("blockMath", {
      latex: typeof token.latex === "string" ? token.latex : "",
    });
  },
});

/** Replace math delimiters in HTML with KaTeX (publication preview). */
export function renderMathInMarkdownHtml(html: string): string {
  let next = html.replace(/\$\$([\s\S]+?)\$\$/g, (_raw, latex: string) => {
    const { html: rendered, error } = renderLatexHtml(latex.trim(), true);
    if (error || !rendered) {
      return `<pre class="blogide-math-error">$$${escapeHtml(latex)}$$</pre>`;
    }
    return `<div class="blogide-block-math">${rendered}</div>`;
  });
  next = next.replace(
    /\$([^\s$][^$\n]*?[^\s$])\$|\$([^\s$])\$/g,
    (raw, a: string, b: string) => {
      const latex = a || b;
      if (!latex) return raw;
      const { html: rendered, error } = renderLatexHtml(latex, false);
      if (error || !rendered) {
        return `<code class="blogide-math-error">$${escapeHtml(latex)}$</code>`;
      }
      return `<span class="blogide-inline-math">${rendered}</span>`;
    }
  );
  return next;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
