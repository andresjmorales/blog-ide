/**
 * Clipboard HTML for publish-style pastes. Native platform footnotes cannot
 * be created by HTML alone: Substack only builds footnoteAnchor nodes via
 * insertFootnote(), and Medium has no footnote schema.
 *
 * Hover-tip chrome from the in-app preview is never included. text/plain
 * on the clipboard is a readable rendering of this HTML, never markdown
 * source (some editors will otherwise paste the markdown).
 */

import { buildPublicationPreview } from "@/lib/preview/publicationHtml";
import { htmlToPlainText } from "@/lib/export/htmlPlain";
import {
  SUBSTACK_NOTES_HEADING,
  SUBSTACK_POETRY_END,
  SUBSTACK_POETRY_START,
} from "@/lib/export/substackEditorHelper";

export type PublishCopyFormat = "superscripts" | "html" | "markers";

/** Current ids plus older Substack/Medium aliases. */
export type PublishCopyTarget =
  | PublishCopyFormat
  | "substack"
  | "medium"
  | "substack-native";

export const PUBLISH_COPY_TARGETS: Array<{
  id: PublishCopyFormat;
  label: string;
  hint: string;
}> = [
  {
    id: "markers",
    label: "Bracketed numbers [1]",
    hint: "In-text [1] markers and a Notes list at the end",
  },
  {
    id: "superscripts",
    label: "Superscript numbers",
    hint: "In-text superscripts and a Notes list at the end",
  },
  {
    id: "html",
    label: "Linked HTML endnotes",
    hint: "Publication HTML with numbered refs linked to notes",
  },
];

export function resolvePublishCopyTarget(
  target: PublishCopyTarget
): PublishCopyFormat {
  if (target === "html") return "html";
  if (target === "markers" || target === "substack-native") return "markers";
  return "superscripts";
}

/**
 * What the markers copy hands to the Substack helper. Each flag that is on
 * leaves a marker the helper turns into native Substack formatting; each
 * flag that is off pastes a static fallback that reads fine without it.
 */
export type MarkersCopyOptions = {
  /** `[1]` markers + Notes list (off: static ¹ numbers + Notes list). */
  footnotes: boolean;
  /** Keep images (off: drop them and upload by hand in Substack). */
  images: boolean;
  /** `{sup:27}` / `{sub:2}` markers (off: Unicode ²⁷ where possible). */
  superscripts: boolean;
  /** Display math as a `$$…$$` paragraph (off: a LaTeX code block). */
  math: boolean;
  /** `{poetry}` … `{/poetry}` around poems (off: line breaks only). */
  poetry: boolean;
};

export const DEFAULT_MARKERS_OPTIONS: MarkersCopyOptions = {
  footnotes: true,
  images: true,
  superscripts: true,
  math: true,
  poetry: true,
};

export type PublishCopyResult = {
  title: string;
  html: string;
  plain: string;
};

type PreparedBody = {
  title: string;
  doc: Document;
  root: HTMLElement;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function preparePublicationBody(markdown: string): PreparedBody | null {
  const preview = buildPublicationPreview(markdown);
  if (typeof DOMParser === "undefined") return null;
  const doc = new DOMParser().parseFromString(
    `<div id="root">${preview.bodyHtml}</div>`,
    "text/html"
  );
  const root = doc.getElementById("root");
  if (!root) return null;
  root.querySelectorAll(".preview-fn-tip").forEach((el) => el.remove());
  return { title: preview.title, doc, root };
}

function withTitle(title: string, body: string): string {
  const trimmed = title.trim();
  return trimmed ? `<h1>${escapeHtml(trimmed)}</h1>\n${body}` : body;
}

function footnoteNumber(wrap: Element): string | null {
  return wrap.querySelector(".preview-fn-ref")?.getAttribute("data-fn") ?? null;
}

function collectNoteItems(root: HTMLElement): Array<{ id: string; body: Element | null }> {
  const section = root.querySelector(".preview-footnotes");
  if (!section) return [];
  return [...section.querySelectorAll(".preview-footnotes-item")].map((item) => ({
    id: item.id?.replace(/^fn-/, "") || "",
    body: item.querySelector(".preview-footnotes-body"),
  }));
}

function moveBody(target: Element, body: Element | null): void {
  if (!body) return;
  while (body.firstChild) target.appendChild(body.firstChild);
}

function replaceRefsWithSup(doc: Document, root: HTMLElement): void {
  root.querySelectorAll(".preview-fn").forEach((wrap) => {
    const n = footnoteNumber(wrap);
    if (!n) return;
    const sup = doc.createElement("sup");
    sup.textContent = n;
    wrap.replaceWith(sup);
  });
}

function replaceRefsWithMarkers(
  doc: Document,
  root: HTMLElement,
  options: { helper: boolean } = { helper: true }
): void {
  root.querySelectorAll(".preview-fn").forEach((wrap) => {
    const n = footnoteNumber(wrap);
    if (!n) return;
    wrap.replaceWith(
      doc.createTextNode(options.helper ? `[${n}]` : toUnicodeScript(n, "sup") ?? `(${n})`)
    );
  });
}

const SUP_CHARS: Record<string, string> = {
  "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶",
  "7": "⁷", "8": "⁸", "9": "⁹", "+": "⁺", "-": "⁻", "=": "⁼", "(": "⁽",
  ")": "⁾", n: "ⁿ", i: "ⁱ",
};

const SUB_CHARS: Record<string, string> = {
  "0": "₀", "1": "₁", "2": "₂", "3": "₃", "4": "₄", "5": "₅", "6": "₆",
  "7": "₇", "8": "₈", "9": "₉", "+": "₊", "-": "₋", "=": "₌", "(": "₍",
  ")": "₎",
};

/** Unicode super/subscript for short numeric-ish text, or null if unmappable. */
export function toUnicodeScript(text: string, kind: "sup" | "sub"): string | null {
  const map = kind === "sup" ? SUP_CHARS : SUB_CHARS;
  if (!text) return null;
  let out = "";
  for (const ch of text) {
    const mapped = map[ch];
    if (!mapped) return null;
    out += mapped;
  }
  return out;
}

/**
 * Content `<sup>` / `<sub>` (verse numbers, ordinals, chemistry). Substack
 * drops whole blockquotes that contain them, so they never paste as tags.
 */
function replaceScripts(
  doc: Document,
  root: HTMLElement,
  options: { helper: boolean }
): void {
  for (const el of [...root.querySelectorAll("sup, sub")]) {
    const kind = el.tagName.toLowerCase() === "sup" ? "sup" : "sub";
    const text = el.textContent ?? "";
    if (!text) {
      el.remove();
      continue;
    }
    if (options.helper && !/[{}]/.test(text)) {
      el.replaceWith(doc.createTextNode(`{${kind}:${text}}`));
      continue;
    }
    el.replaceWith(doc.createTextNode(toUnicodeScript(text, kind) ?? text));
  }
}

/**
 * KaTeX HTML pastes as duplicated garbage (MathML + spans). Paste LaTeX
 * source instead: inline as `$…$`, display as a `$$…$$` paragraph the
 * helper can convert, or a code block when the helper will not run.
 */
function replaceMathWithSource(
  doc: Document,
  root: HTMLElement,
  options: { helper: boolean }
): void {
  for (const el of [...root.querySelectorAll(".blogide-inline-math")]) {
    const latex = el.getAttribute("data-latex") ?? el.textContent ?? "";
    el.replaceWith(doc.createTextNode(`$${latex}$`));
  }
  for (const el of [...root.querySelectorAll(".blogide-block-math")]) {
    const latex = (el.getAttribute("data-latex") ?? el.textContent ?? "").trim();
    const inNotes = Boolean(el.closest(".preview-footnotes"));
    if (options.helper && !inNotes) {
      const p = doc.createElement("p");
      p.textContent = `$$${latex}$$`;
      el.replaceWith(p);
    } else {
      const pre = doc.createElement("pre");
      const code = doc.createElement("code");
      code.textContent = latex;
      pre.appendChild(code);
      el.replaceWith(pre);
    }
  }
}

/** Leading spaces → no-break spaces so indents survive HTML paste. */
function appendPoemLine(doc: Document, target: Element, line: Node[]): void {
  let leading = true;
  for (const node of line) {
    if (leading && node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? "";
      const match = /^[ \t]+/.exec(text);
      if (match) {
        const width = match[0].replace(/\t/g, "    ").length;
        target.appendChild(
          doc.createTextNode("\u00a0".repeat(width) + text.slice(match[0].length))
        );
        leading = false;
        continue;
      }
    }
    leading = false;
    target.appendChild(node);
  }
}

/** Split a pre-wrap poem into lines of cloned inline nodes. */
function poemLines(poem: Element): Node[][] {
  const lines: Node[][] = [[]];
  function walk(node: Node, wrap: (inner: Node) => Node): void {
    if (node.nodeType === Node.TEXT_NODE) {
      const parts = (node.textContent ?? "").split("\n");
      parts.forEach((part, index) => {
        if (index > 0) lines.push([]);
        if (part) lines[lines.length - 1].push(wrap(node.ownerDocument!.createTextNode(part)));
      });
      return;
    }
    if (!(node instanceof Element)) return;
    if (node.tagName.toLowerCase() === "br") {
      lines.push([]);
      return;
    }
    for (const child of [...node.childNodes]) {
      walk(child, (inner) => {
        const clone = node.cloneNode(false);
        clone.appendChild(inner);
        return wrap(clone);
      });
    }
  }
  for (const child of [...poem.childNodes]) walk(child, (inner) => inner);
  return lines;
}

/**
 * Poems are one pre-wrap div in BlogIDE. Pasted HTML collapses those
 * newlines, so emit stanzas as paragraphs with `<br>` lines, optionally
 * fenced by `{poetry}` / `{/poetry}` for the helper.
 */
function replacePoetry(
  doc: Document,
  root: HTMLElement,
  options: { helper: boolean }
): void {
  for (const poem of [...root.querySelectorAll("div.poetry")]) {
    const lines = poemLines(poem);
    while (lines.length && lines[lines.length - 1].length === 0) lines.pop();
    while (lines.length && lines[0].length === 0) lines.shift();
    const stanzas: Node[][][] = [[]];
    for (const line of lines) {
      const blank = line.every((node) => !(node.textContent ?? "").trim());
      if (blank) {
        if (stanzas[stanzas.length - 1].length) stanzas.push([]);
        continue;
      }
      stanzas[stanzas.length - 1].push(line);
    }
    const frag = doc.createDocumentFragment();
    const nested = Boolean(poem.closest("blockquote, li, .preview-footnotes"));
    const fence = options.helper && !nested;
    if (fence) {
      const start = doc.createElement("p");
      start.textContent = SUBSTACK_POETRY_START;
      frag.appendChild(start);
    }
    for (const stanza of stanzas) {
      if (!stanza.length) continue;
      const p = doc.createElement("p");
      stanza.forEach((line, index) => {
        if (index > 0) p.appendChild(doc.createElement("br"));
        appendPoemLine(doc, p, line);
      });
      frag.appendChild(p);
    }
    if (fence) {
      const end = doc.createElement("p");
      end.textContent = SUBSTACK_POETRY_END;
      frag.appendChild(end);
    }
    poem.replaceWith(frag);
  }
}

function removeImages(root: HTMLElement): void {
  for (const figure of [...root.querySelectorAll("figure")]) {
    if (figure.querySelector("img")) figure.remove();
  }
  root.querySelectorAll("img").forEach((img) => img.remove());
  for (const p of [...root.querySelectorAll("p")]) {
    if (!p.childNodes.length) p.remove();
  }
}

function replaceEndnotesWithList(
  doc: Document,
  root: HTMLElement,
  options: { heading: boolean }
): void {
  const items = collectNoteItems(root);
  const section = root.querySelector(".preview-footnotes");
  if (!section) return;
  const frag = doc.createDocumentFragment();
  if (options.heading && items.length) {
    const heading = doc.createElement("p");
    heading.textContent = SUBSTACK_NOTES_HEADING;
    frag.appendChild(heading);
  }
  const list = doc.createElement("ol");
  for (const item of items) {
    const li = doc.createElement("li");
    moveBody(li, item.body);
    list.appendChild(li);
  }
  frag.appendChild(list);
  section.replaceWith(frag);
}

const INLINE_TAGS = new Set([
  "a",
  "em",
  "strong",
  "b",
  "i",
  "u",
  "s",
  "code",
  "span",
]);

/** Drop `<sup>` / `<sub>` but keep their text (Substack drops some blocks that contain them). */
export function unwrapSupSub(root: ParentNode): void {
  for (const el of [...root.querySelectorAll("sup, sub")]) {
    el.replaceWith(...el.childNodes);
  }
}

function lastChildIsBr(target: Element): boolean {
  const last = target.lastChild;
  return last instanceof HTMLElement && last.tagName.toLowerCase() === "br";
}

function appendInlineClone(
  doc: Document,
  target: Element,
  node: Node,
  options: { tight?: boolean } = {}
): void {
  if (node.nodeType === Node.TEXT_NODE) {
    target.appendChild(doc.createTextNode(node.textContent ?? ""));
    return;
  }
  if (!(node instanceof HTMLElement)) return;
  const tag = node.tagName.toLowerCase();
  if (tag === "br") {
    if (!lastChildIsBr(target) && target.childNodes.length) {
      target.appendChild(doc.createElement("br"));
    }
    return;
  }
  if (tag === "sup" || tag === "sub") {
    for (const child of [...node.childNodes]) {
      appendInlineClone(doc, target, child, options);
    }
    return;
  }
  if (tag === "a") {
    const a = doc.createElement("a");
    const href = node.getAttribute("href");
    if (href) a.setAttribute("href", href);
    for (const child of [...node.childNodes]) appendInlineClone(doc, a, child);
    if (a.textContent || href) target.appendChild(a);
    return;
  }
  if (INLINE_TAGS.has(tag)) {
    const clone = doc.createElement(tag);
    for (const child of [...node.childNodes]) appendInlineClone(doc, clone, child);
    if (clone.childNodes.length) target.appendChild(clone);
    return;
  }
  if (tag === "ul" || tag === "ol") {
    const items = [...node.children].filter(
      (child) => child.tagName.toLowerCase() === "li"
    );
    items.forEach((li, index) => {
      if (target.childNodes.length && !lastChildIsBr(target)) {
        target.appendChild(doc.createElement("br"));
      }
      const prefix = tag === "ol" ? `${index + 1}. ` : "• ";
      target.appendChild(doc.createTextNode(prefix));
      for (const child of [...li.childNodes]) {
        appendInlineClone(doc, target, child, { tight: true });
      }
    });
    return;
  }
  if (
    tag === "li" ||
    tag === "p" ||
    tag === "div" ||
    tag === "blockquote" ||
    tag === "section"
  ) {
    if (
      !options.tight &&
      target.childNodes.length &&
      !lastChildIsBr(target)
    ) {
      target.appendChild(doc.createElement("br"));
    }
    for (const child of [...node.childNodes]) appendInlineClone(doc, target, child);
    return;
  }
  for (const child of [...node.childNodes]) appendInlineClone(doc, target, child);
}

/**
 * One paragraph of phrasing content so Substack will not split a list item.
 * Nested lists and paragraphs become `<br>` plus `•` / `1.` markers so
 * newlines and bullets survive paste.
 */
export function flattenToParagraph(doc: Document, source: Element): HTMLParagraphElement {
  const p = doc.createElement("p");
  for (const child of [...source.childNodes]) appendInlineClone(doc, p, child);
  return p;
}

function flattenBlockquotes(doc: Document, root: ParentNode): void {
  for (const quote of [...root.querySelectorAll("blockquote")]) {
    quote.replaceChildren(flattenToParagraph(doc, quote));
  }
}

function notesList(root: ParentNode): HTMLOListElement | null {
  const heading = [...root.querySelectorAll("p")].find(
    (p) => (p.textContent ?? "").trim() === SUBSTACK_NOTES_HEADING
  );
  const after = heading?.nextElementSibling;
  if (after instanceof HTMLOListElement) return after;
  const lists = [...root.querySelectorAll("ol")];
  return lists[lists.length - 1] ?? null;
}

function flattenNotesItems(doc: Document, root: ParentNode): void {
  const list = notesList(root);
  if (!list) return;
  for (const li of [...list.children]) {
    if (!(li instanceof HTMLLIElement)) continue;
    li.replaceChildren(flattenToParagraph(doc, li));
  }
}

/**
 * Substack's paste sanitizer drops some blocks that contain `<sup>` and
 * splits list items that have nested block tags (a URL on its own line
 * inside a note is the usual case). Markers HTML has to stay simple.
 */
export function sanitizeMarkersHtml(doc: Document, root: HTMLElement): void {
  unwrapSupSub(root);
  flattenBlockquotes(doc, root);
  flattenNotesItems(doc, root);
}

/** Paste-safe: superscripts + Notes list. No hash links. */
function formatSuperscripts(doc: Document, root: HTMLElement): void {
  replaceMathWithSource(doc, root, { helper: false });
  replacePoetry(doc, root, { helper: false });
  replaceRefsWithSup(doc, root);
  replaceEndnotesWithList(doc, root, { heading: true });
}

/**
 * Markers the Substack editor helper can find, plus a Notes ordered list
 * whose formatting survives paste into ProseMirror.
 */
function formatMarkers(
  doc: Document,
  root: HTMLElement,
  options: MarkersCopyOptions
): void {
  if (!options.images) removeImages(root);
  replaceMathWithSource(doc, root, { helper: options.math });
  replacePoetry(doc, root, { helper: options.poetry });
  replaceRefsWithMarkers(doc, root, { helper: options.footnotes });
  replaceScripts(doc, root, { helper: options.superscripts });
  replaceEndnotesWithList(doc, root, { heading: true });
  sanitizeMarkersHtml(doc, root);
}

/** Linked endnotes for HTML files / CMSs that keep href + id. */
function formatHtml(doc: Document, root: HTMLElement): void {
  root.querySelectorAll(".preview-fn").forEach((wrap) => {
    const n = footnoteNumber(wrap);
    const ref = wrap.querySelector(".preview-fn-ref");
    if (!n || !ref) return;
    const sup = doc.createElement("sup");
    const anchor = doc.createElement("a");
    anchor.href = `#fn-${n}`;
    anchor.id = `fnref-${n}`;
    anchor.textContent = n;
    sup.appendChild(anchor);
    wrap.replaceWith(sup);
  });

  const items = collectNoteItems(root);
  const section = root.querySelector(".preview-footnotes");
  if (!section) return;
  const wrap = doc.createElement("section");
  wrap.className = "footnotes";
  const heading = doc.createElement("h2");
  heading.textContent = "Notes";
  wrap.appendChild(heading);
  const list = doc.createElement("ol");
  for (const item of items) {
    const li = doc.createElement("li");
    li.id = `fn-${item.id}`;
    moveBody(li, item.body);
    const back = doc.createElement("a");
    back.href = `#fnref-${item.id}`;
    back.textContent = "↩";
    li.appendChild(doc.createTextNode(" "));
    li.appendChild(back);
    list.appendChild(li);
  }
  wrap.appendChild(list);
  section.replaceWith(wrap);
}

/**
 * HTML for a publish target. `plain` is what should go in text/plain.
 * Body-only pastes omit the essay title (the destination has its own title
 * field). Linked HTML includes it.
 */
export function htmlForPublishTarget(
  markdown: string,
  target: PublishCopyTarget,
  markersOptions: MarkersCopyOptions = DEFAULT_MARKERS_OPTIONS
): PublishCopyResult {
  const format = resolvePublishCopyTarget(target);
  const preview = buildPublicationPreview(markdown);
  const prepared = preparePublicationBody(markdown);
  if (!prepared) {
    const html =
      format === "html"
        ? withTitle(preview.title, preview.bodyHtml)
        : preview.bodyHtml;
    return { title: preview.title, html, plain: htmlToPlainText(html) };
  }
  if (format === "html") formatHtml(prepared.doc, prepared.root);
  else if (format === "markers") {
    formatMarkers(prepared.doc, prepared.root, markersOptions);
  }
  else formatSuperscripts(prepared.doc, prepared.root);

  const body = prepared.root.innerHTML;
  const html = format === "html" ? withTitle(prepared.title, body) : body;
  return {
    title: prepared.title,
    html,
    plain: htmlToPlainText(html),
  };
}

/** @deprecated Use htmlForPublishTarget(md, "superscripts") */
export function clipboardHtmlFromMarkdown(markdown: string): {
  title: string;
  html: string;
} {
  const result = htmlForPublishTarget(markdown, "superscripts");
  return { title: result.title, html: result.html };
}
