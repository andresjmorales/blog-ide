import { renderLatexHtml } from "@/lib/editor/math";

/** Fenced blocks and inline code spans — never rewrite math inside these. */
const CODE_RE = /(```[\s\S]*?(?:```|$)|~~~[\s\S]*?(?:~~~|$)|`[^`\n]*`)/g;

/**
 * Models often use LaTeX's `\[…\]` / `\(…\)` delimiters, which markdown turns
 * into bare brackets (`\[` is an escaped `[`). Rewrite them to the `$$…$$` /
 * `$…$` forms the markdown pipeline understands, leaving code untouched.
 */
export function normalizeChatMathDelimiters(text: string): string {
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

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Static HTML from the editor schema only has empty math placeholders (the
 * editor draws KaTeX in node views). Fill them in; show the raw LaTeX when
 * KaTeX can't render it so nothing is left blank.
 */
export function renderChatMath(root: ParentNode): void {
  root
    .querySelectorAll<HTMLElement>("[data-inline-math], [data-block-math]")
    .forEach((el) => {
      const latex = el.getAttribute("data-latex") ?? "";
      if (!latex.trim()) return;
      const display = el.hasAttribute("data-block-math");
      const { html, error } = renderLatexHtml(latex, display);
      if (html && !error) {
        el.innerHTML = html;
        return;
      }
      const source = display ? `$$${latex}$$` : `$${latex}$`;
      el.innerHTML = display
        ? `<pre class="blogide-math-error"><code>${escapeHtml(source)}</code></pre>`
        : `<code class="blogide-math-error">${escapeHtml(source)}</code>`;
    });
}
