import { decodeMath, normalizeLatexDelimiters, prepareMath } from "@/lib/editor/math";

const TEX_ANNOTATION = 'annotation[encoding="application/x-tex"]';
const SENTINEL_RE = /\[\[blogide-math-(i|b):([A-Za-z0-9_-]*)\]\]/g;

function mathElement(doc: Document, latex: string, display: boolean): HTMLElement {
  const el = doc.createElement(display ? "div" : "span");
  el.setAttribute(display ? "data-block-math" : "data-inline-math", "");
  el.setAttribute("data-latex", latex);
  return el;
}

/**
 * Rendered math (KaTeX, MathJax / MathML with a TeX annotation — what AI
 * chats and Wikipedia put on the clipboard) → math nodes from its source.
 */
function replaceRenderedMath(doc: Document): void {
  for (const math of [...doc.querySelectorAll("math")]) {
    const latex = math.querySelector(TEX_ANNOTATION)?.textContent?.trim();
    if (!latex) continue;
    const katex = math.closest(".katex-display, .katex");
    const target = katex ?? math;
    const display =
      target.classList.contains("katex-display") ||
      Boolean(target.closest(".katex-display")) ||
      math.getAttribute("display") === "block";
    const host = target.closest(".katex-display") ?? target;
    host.replaceWith(mathElement(doc, latex, display));
  }
}

/** `$…$` / `$$…$$` / `\(…\)` / `\[…\]` typed as text → math nodes. */
function replaceDelimitedMath(doc: Document): void {
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  const texts: Text[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node as Text;
    if (!/[$\\]/.test(text.data)) continue;
    if (text.parentElement?.closest("pre, code, [data-latex]")) continue;
    texts.push(text);
  }
  for (const text of texts) {
    const prepared = prepareMath(normalizeLatexDelimiters(text.data));
    if (!prepared.includes("[[blogide-math-")) continue;
    const fragment = doc.createDocumentFragment();
    let last = 0;
    for (const match of prepared.matchAll(SENTINEL_RE)) {
      const before = prepared.slice(last, match.index);
      const display = match[1] === "b";
      // Block sentinels are padded with newlines for the markdown tokenizer.
      const plain = display ? before.replace(/\n$/, "") : before;
      if (plain) fragment.append(plain);
      fragment.append(mathElement(doc, decodeMath(match[2] ?? ""), display));
      last = (match.index ?? 0) + match[0].length;
      if (display && prepared[last] === "\n") last += 1;
    }
    const rest = prepared.slice(last);
    if (rest) fragment.append(rest);
    text.replaceWith(fragment);
  }
}

function isBlank(nodes: Node[]): boolean {
  return nodes.every(
    (node) =>
      (node.nodeType === Node.TEXT_NODE && !node.textContent?.trim()) ||
      (node instanceof Element && node.tagName === "BR")
  );
}

/**
 * Display math inside a `<p>` would leave empty paragraphs around it: split
 * the paragraph so the equation sits between its text as its own block.
 */
function liftBlockMath(doc: Document): void {
  for (const math of [...doc.querySelectorAll("p > div[data-block-math]")]) {
    const paragraph = math.parentElement;
    if (!paragraph) continue;
    const children = [...paragraph.childNodes];
    const index = children.indexOf(math);
    const parts = [children.slice(0, index), children.slice(index + 1)];
    const [before, after] = parts.map((nodes) => {
      if (isBlank(nodes)) return null;
      const p = paragraph.cloneNode(false) as HTMLElement;
      p.append(...nodes);
      return p;
    });
    paragraph.replaceWith(...[before, math, after].filter((n) => n !== null));
  }
}

/**
 * Pasted HTML carrying math → the editor's math nodes, so it renders instead
 * of pasting as raw `$…$` text or a pile of KaTeX spans.
 */
export function convertPastedMathHtml(html: string): string {
  const mayHaveMath =
    html.includes("$") ||
    html.includes("\\(") ||
    html.includes("\\[") ||
    html.includes("<math");
  if (!mayHaveMath || typeof DOMParser === "undefined") return html;
  const doc = new DOMParser().parseFromString(html, "text/html");
  replaceRenderedMath(doc);
  replaceDelimitedMath(doc);
  liftBlockMath(doc);
  return doc.body.innerHTML;
}
