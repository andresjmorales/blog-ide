import { renderLatexHtml } from "@/lib/editor/math";

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
