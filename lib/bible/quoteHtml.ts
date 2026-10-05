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

const CHAPTER_SELECTOR = "h1[data-c], h2[data-c], h3[data-c], h4[data-c]";
const BLOCK_SELECTOR = "h1, h2, h3, h4, h5, h6, p, div, li";
const POETRY_CLASS = /\bfb-(?:q\d?|qm\d?|qr|qc|pi\d?|li\d?)\b/;

function collapseSpace(value: string): string {
  return value.replace(/[\s ]+/g, " ").trim();
}

function noteLabel(index: number): string {
  let n = index;
  let label = "";
  do {
    label = String.fromCharCode(97 + (n % 26)) + label;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return label;
}

/**
 * fetch(bible) passage HTML → clipboard text.
 *
 * Plain: verse text only (no verse numbers, chapter numbers, headings or
 * footnotes), one paragraph per block and one line per poetry line.
 * Markers: also keeps `Chapter N` lines, section headings, `[16]` verse
 * numbers and footnotes as `[a]` markers listed under the passage.
 * Both end with a `— Reference (Translation)` line when `citation` is given.
 */
export function bibleQuoteClipboardText(
  html: string,
  options: { markers: boolean; citation?: string }
): string {
  const { markers, citation } = options;
  const lines: string[] = [];
  const notes: string[] = [];
  let prevPoetry = false;

  const push = (text: string, poetry = false) => {
    if (!text) return;
    if (lines.length) lines.push(poetry && prevPoetry ? "\n" : "\n\n");
    lines.push(text);
    prevPoetry = poetry;
  };

  if (typeof DOMParser === "undefined") {
    push(collapseSpace(html.replace(/<[^>]+>/g, " ")));
  } else {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const root = doc.body;
    root.querySelectorAll(".fb-attribution").forEach((el) => el.remove());

    const blocks = [...root.querySelectorAll(BLOCK_SELECTOR)].filter(
      (el) => !el.querySelector(BLOCK_SELECTOR)
    );
    for (const block of blocks) {
      if (block.matches(CHAPTER_SELECTOR)) {
        if (markers) {
          const chapter =
            block.getAttribute("data-c") || collapseSpace(block.textContent ?? "");
          push(`Chapter ${chapter}`);
        }
        continue;
      }
      if (block.matches(HEADING_SELECTOR)) {
        if (markers) {
          const clone = block.cloneNode(true) as Element;
          clone.querySelectorAll(NOTE_SELECTOR).forEach((el) => el.remove());
          push(collapseSpace(clone.textContent ?? ""));
        }
        continue;
      }

      const clone = block.cloneNode(true) as Element;
      clone.querySelectorAll(".fb-note").forEach((note) => {
        if (!markers) {
          note.remove();
          return;
        }
        const body = collapseSpace(note.textContent ?? "");
        if (!body) {
          note.remove();
          return;
        }
        const label = noteLabel(notes.length);
        notes.push(`[${label}] ${body}`);
        note.replaceWith(doc.createTextNode(`[${label}]`));
      });
      clone.querySelectorAll(NOTE_SELECTOR).forEach((el) => el.remove());
      clone.querySelectorAll("sup[data-v]").forEach((sup) => {
        if (!markers) {
          sup.remove();
          return;
        }
        const number = collapseSpace(sup.textContent ?? "");
        sup.replaceWith(doc.createTextNode(number ? ` [${number}] ` : " "));
      });
      push(
        collapseSpace(clone.textContent ?? ""),
        POETRY_CLASS.test(block.getAttribute("class") ?? "")
      );
    }
  }

  let out = lines.join("");
  if (notes.length) out += `\n\n${notes.join("\n")}`;
  if (citation && out) out += `\n\n— ${citation}`;
  return out;
}
