/**
 * fetch(bible) passage HTML → something BlogIDE can insert or copy.
 *
 * The hover card already styles verse numbers as `sup[data-v]` and hides
 * headings with `.no-headings` / `.no-chapters`. Insert quote used to flatten
 * that to plain text (so headings leaked in and verse numbers lost their
 * superscript). This pass removes heading/note chrome and keeps verse `<sup>`.
 */

const HEADING_SELECTOR = [
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  ".fb-ms",
  ".fb-ms1",
  ".fb-ms2",
  ".fb-ms3",
  ".fb-ms4",
  ".fb-mr",
  ".fb-s",
  ".fb-s1",
  ".fb-s2",
  ".fb-s3",
  ".fb-s4",
  ".fb-sr",
  ".fb-r",
  ".fb-sp",
  ".fb-qa",
].join(", ");

const NOTE_SELECTOR = ".fb-note, .fb-fr, .fb-ft, .fb-fqa";

const VERSE_SPAN_SELECTOR = "span.fb-v, span[data-v]:not(sup)";

export function looksLikeFetchBibleHtml(html: string): boolean {
  return /data-v\s*=|fetch-bible|class="[^"]*\bfb-(?:p|s|v|ms|chapter)\b/i.test(
    html
  );
}

function pruneEmptyBlocks(root: ParentNode): void {
  for (const el of [...root.querySelectorAll("p, div, span, li")]) {
    if (el.querySelector("img, br, sup, sub")) continue;
    const text = (el.textContent ?? "").replace(/\u00a0/g, " ").trim();
    if (!text && el.childElementCount === 0) el.remove();
  }
}

function verseNumberFrom(el: Element): string {
  const attr = el.getAttribute("data-v") ?? el.getAttribute("data-verse");
  if (attr && /^\d+[a-z]?$/i.test(attr.trim())) return attr.trim();
  const text = (el.textContent ?? "").trim();
  return text;
}

/** Rewrite fetch.bible chrome so verse numbers are real `<sup>` and headings are gone. */
export function prepareBibleQuoteHtml(html: string): string {
  if (!html.trim()) return "";
  if (typeof DOMParser === "undefined") {
    return html
      .replace(/<h[1-6][^>]*>[\s\S]*?<\/h[1-6]>/gi, "")
      .replace(/<span[^>]*class="[^"]*\bfb-note\b[^"]*"[^>]*>[\s\S]*?<\/span>/gi, "")
      .trim();
  }

  const doc = new DOMParser().parseFromString(html, "text/html");
  const root = doc.body;

  root.querySelectorAll(NOTE_SELECTOR).forEach((el) => el.remove());
  root.querySelectorAll(HEADING_SELECTOR).forEach((el) => el.remove());

  root.querySelectorAll(VERSE_SPAN_SELECTOR).forEach((el) => {
    const number = verseNumberFrom(el);
    if (!number) {
      el.remove();
      return;
    }
    const sup = doc.createElement("sup");
    const dataV = el.getAttribute("data-v");
    if (dataV) sup.setAttribute("data-v", dataV);
    sup.textContent = number;
    el.replaceWith(sup);
  });

  pruneEmptyBlocks(root);
  return root.innerHTML.trim();
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Wrap prepared passage HTML in a blockquote with a citation line. */
export function wrapBibleQuoteAsBlockquote(
  passageHtml: string,
  citation: string
): string {
  const body = passageHtml.trim() || "<p></p>";
  return `<blockquote>${body}<p>— ${escapeHtml(citation)}</p></blockquote>`;
}
