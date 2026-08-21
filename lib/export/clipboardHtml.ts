/**
 * Platform-specific HTML for pasting into Substack, Medium, and HTML
 * targets. Native platform footnotes cannot be created by clipboard HTML:
 * Substack only builds footnoteAnchor nodes via insertFootnote(), and
 * Medium has no footnote schema at all.
 *
 * Hover-tip chrome from the in-app preview is never included. text/plain
 * on the clipboard is a readable rendering of this HTML, never markdown
 * source (Substack will otherwise paste the markdown).
 */

import { buildPublicationPreview } from "@/lib/preview/publicationHtml";
import { htmlToPlainText } from "@/lib/export/htmlPlain";
import { SUBSTACK_NOTES_HEADING } from "@/lib/export/substackEditorHelper";

export type PublishCopyTarget =
  | "substack"
  | "substack-native"
  | "medium"
  | "html";

export const PUBLISH_COPY_TARGETS: Array<{
  id: Exclude<PublishCopyTarget, "substack-native">;
  label: string;
  hint: string;
}> = [
  {
    id: "substack",
    label: "Substack",
    hint: "Formatted paste with static numbered notes",
  },
  {
    id: "medium",
    label: "Medium",
    hint: "Superscripts and a Notes list",
  },
  {
    id: "html",
    label: "HTML",
    hint: "Publication HTML with linked endnotes",
  },
];

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

/** Paste-safe: superscripts + Notes list. No hash links (Substack strips them). */
function formatSubstack(doc: Document, root: HTMLElement): void {
  replaceRefsWithSup(doc, root);
  replaceEndnotesWithList(doc, root, { heading: true });
}

/**
 * Markers the Substack editor helper can find, plus a Notes ordered list
 * whose formatting survives paste into ProseMirror.
 */
function formatSubstackNative(doc: Document, root: HTMLElement): void {
  replaceRefsWithMarkers(doc, root);
  replaceEndnotesWithList(doc, root, { heading: true });
}

/** Medium has no footnote schema. Superscripts + Notes is the real format. */
function formatMedium(doc: Document, root: HTMLElement): void {
  replaceRefsWithSup(doc, root);
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
 * Platform pastes omit the essay title (Substack/Medium have their own
 * title field). HTML includes it.
 */
export function htmlForPublishTarget(
  markdown: string,
  target: PublishCopyTarget
): PublishCopyResult {
  const preview = buildPublicationPreview(markdown);
  const prepared = preparePublicationBody(markdown);
  if (!prepared) {
    const html =
      target === "html"
        ? withTitle(preview.title, preview.bodyHtml)
        : preview.bodyHtml;
    return { title: preview.title, html, plain: htmlToPlainText(html) };
  }
  if (target === "medium") formatMedium(prepared.doc, prepared.root);
  else if (target === "html") formatHtml(prepared.doc, prepared.root);
  else if (target === "substack-native") {
    formatSubstackNative(prepared.doc, prepared.root);
  } else formatSubstack(prepared.doc, prepared.root);

  const body = prepared.root.innerHTML;
  const html = target === "html" ? withTitle(prepared.title, body) : body;
  return {
    title: prepared.title,
    html,
    plain: htmlToPlainText(html),
  };
}

/** @deprecated Use htmlForPublishTarget(md, "substack") */
export function clipboardHtmlFromMarkdown(markdown: string): {
  title: string;
  html: string;
} {
  const result = htmlForPublishTarget(markdown, "substack");
  return { title: result.title, html: result.html };
}
