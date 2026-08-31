/** Unicode superscript / subscript glyphs → ASCII, for paste → real marks. */

export const UNICODE_SUPERSCRIPT: Record<string, string> = {
  "⁰": "0",
  "¹": "1",
  "²": "2",
  "³": "3",
  "⁴": "4",
  "⁵": "5",
  "⁶": "6",
  "⁷": "7",
  "⁸": "8",
  "⁹": "9",
  "⁺": "+",
  "⁻": "-",
  "⁼": "=",
  "⁽": "(",
  "⁾": ")",
  "ⁿ": "n",
  "ⁱ": "i",
};

export const UNICODE_SUBSCRIPT: Record<string, string> = {
  "₀": "0",
  "₁": "1",
  "₂": "2",
  "₃": "3",
  "₄": "4",
  "₅": "5",
  "₆": "6",
  "₇": "7",
  "₈": "8",
  "₉": "9",
  "₊": "+",
  "₋": "-",
  "₌": "=",
  "₍": "(",
  "₎": ")",
  "ₐ": "a",
  "ₑ": "e",
  "ₕ": "h",
  "ᵢ": "i",
  "ⱼ": "j",
  "ₖ": "k",
  "ₗ": "l",
  "ₘ": "m",
  "ₙ": "n",
  "ₒ": "o",
  "ₚ": "p",
  "ᵣ": "r",
  "ₛ": "s",
  "ₜ": "t",
  "ᵤ": "u",
  "ᵥ": "v",
  "ₓ": "x",
};

const SUPER_RE = new RegExp(`[${Object.keys(UNICODE_SUPERSCRIPT).join("")}]+`, "g");
const SUB_RE = new RegExp(`[${Object.keys(UNICODE_SUBSCRIPT).join("")}]+`, "g");

const SKIP_PARENTS = new Set(["SUP", "SUB", "CODE", "PRE", "KBD", "SAMP"]);

function decodeRun(run: string, table: Record<string, string>): string {
  return Array.from(run)
    .map((ch) => table[ch] ?? ch)
    .join("");
}

function wrapRuns(text: string, re: RegExp, tag: "sup" | "sub", table: Record<string, string>): string {
  return text.replace(re, (run) => `<${tag}>${decodeRun(run, table)}</${tag}>`);
}

/**
 * Turn Unicode super/sub digits in HTML text nodes into `<sup>` / `<sub>`
 * so paste from Word / PDFs / Ω-menu copies becomes real marks.
 * Skips text already inside sup/sub/code.
 */
export function wrapUnicodeScriptsInHtml(html: string): string {
  if (!html) return html;
  if (typeof DOMParser === "undefined") {
    return wrapRuns(
      wrapRuns(html, SUPER_RE, "sup", UNICODE_SUPERSCRIPT),
      SUB_RE,
      "sub",
      UNICODE_SUBSCRIPT
    );
  }

  const doc = new DOMParser().parseFromString(html, "text/html");
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  let current = walker.nextNode();
  while (current) {
    if (current instanceof Text) nodes.push(current);
    current = walker.nextNode();
  }

  for (const node of nodes) {
    const parent = node.parentElement;
    if (!parent) continue;
    if (parent.closest("sup, sub, code, pre, kbd, samp")) continue;
    if (SKIP_PARENTS.has(parent.tagName)) continue;
    const value = node.nodeValue ?? "";
    if (!SUPER_RE.test(value) && !SUB_RE.test(value)) continue;
    SUPER_RE.lastIndex = 0;
    SUB_RE.lastIndex = 0;
    const wrapped = wrapRuns(
      wrapRuns(value, SUPER_RE, "sup", UNICODE_SUPERSCRIPT),
      SUB_RE,
      "sub",
      UNICODE_SUBSCRIPT
    );
    if (wrapped === value) continue;
    const holder = doc.createElement("span");
    holder.innerHTML = wrapped;
    node.replaceWith(...holder.childNodes);
  }

  return doc.body.innerHTML;
}
