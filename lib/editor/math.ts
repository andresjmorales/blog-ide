import {
  Extension,
  Node,
  mergeAttributes,
  type JSONContent,
} from "@tiptap/core";
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

  addCommands() {
    return {
      insertInlineMath:
        (latex = "x") =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: { latex },
          }),
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

  addCommands() {
    return {
      insertBlockMath:
        (latex = "x^2") =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: { latex },
          }),
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
