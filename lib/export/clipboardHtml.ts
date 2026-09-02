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
import { SUBSTACK_NOTES_HEADING } from "@/lib/export/substackEditorHelper";

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

function preparePublicationBody(markdown: string): PreparedBody | null {
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

function replaceRefsWithMarkers(doc: Document, root: HTMLElement): void {
  root.querySelectorAll(".preview-fn").forEach((wrap) => {
    const n = footnoteNumber(wrap);
    if (!n) return;
    wrap.replaceWith(doc.createTextNode(`[${n}]`));
  });
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

/** Paste-safe: superscripts + Notes list. No hash links. */
function formatSuperscripts(doc: Document, root: HTMLElement): void {
  replaceRefsWithSup(doc, root);
  replaceEndnotesWithList(doc, root, { heading: true });
}

/**
 * Markers the Substack editor helper can find, plus a Notes ordered list
 * whose formatting survives paste into ProseMirror.
 */
function formatMarkers(doc: Document, root: HTMLElement): void {
  replaceRefsWithMarkers(doc, root);
  replaceEndnotesWithList(doc, root, { heading: true });
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
  target: PublishCopyTarget
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
  else if (format === "markers") formatMarkers(prepared.doc, prepared.root);
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
