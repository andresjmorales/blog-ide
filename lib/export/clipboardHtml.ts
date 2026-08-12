/**
 * Platform-specific HTML for pasting into Substack, Medium, and later
 * targets. GFM footnotes become that platform's numbered notes.
 * Hover-tip chrome from the in-app preview is never included.
 */

import { buildPublicationPreview } from "@/lib/preview/publicationHtml";

export type PublishCopyTarget = "substack" | "medium";

export const PUBLISH_COPY_TARGETS: Array<{
  id: PublishCopyTarget;
  label: string;
  hint: string;
}> = [
  {
    id: "substack",
    label: "Substack",
    hint: "Numbered anchors and endnotes",
  },
  {
    id: "medium",
    label: "Medium",
    hint: "Superscripts and numbered endnotes",
  },
];

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

type PreparedBody = {
  title: string;
  doc: Document;
  root: HTMLElement;
};

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

function formatSubstack(doc: Document, root: HTMLElement): void {
  root.querySelectorAll(".preview-fn").forEach((wrap) => {
    const n = wrap.querySelector(".preview-fn-ref")?.getAttribute("data-fn");
    if (!n) return;
    const anchor = doc.createElement("a");
    anchor.className = "footnote-anchor";
    anchor.href = `#footnote-${n}`;
    anchor.id = `footnote-anchor-${n}`;
    anchor.textContent = n;
    wrap.replaceWith(anchor);
  });

  const section = root.querySelector(".preview-footnotes");
  if (!section) return;
  const items = [...section.querySelectorAll(".preview-footnotes-item")];
  const list = doc.createElement("div");
  list.className = "footnotes";
  for (const item of items) {
    const id = item.id?.replace(/^fn-/, "") || "";
    const body = item.querySelector(".preview-footnotes-body");
    const block = doc.createElement("div");
    block.className = "footnote";
    block.id = `footnote-${id}`;
    const back = doc.createElement("a");
    back.href = `#footnote-anchor-${id}`;
    back.className = "footnote-back";
    back.textContent = id;
    block.appendChild(back);
    block.appendChild(doc.createTextNode(" "));
    if (body) {
      while (body.firstChild) block.appendChild(body.firstChild);
    }
    list.appendChild(block);
  }
  section.replaceWith(list);
}

function formatMedium(doc: Document, root: HTMLElement): void {
  root.querySelectorAll(".preview-fn").forEach((wrap) => {
    const n = wrap.querySelector(".preview-fn-ref")?.getAttribute("data-fn");
    if (!n) return;
    const sup = doc.createElement("sup");
    const anchor = doc.createElement("a");
    anchor.href = `#fn-${n}`;
    anchor.id = `fnref-${n}`;
    anchor.textContent = n;
    sup.appendChild(anchor);
    wrap.replaceWith(sup);
  });

  const section = root.querySelector(".preview-footnotes");
  if (!section) return;
  const items = [...section.querySelectorAll(".preview-footnotes-item")];
  const list = doc.createElement("ol");
  list.className = "footnotes";
  for (const item of items) {
    const id = item.id?.replace(/^fn-/, "") || "";
    const body = item.querySelector(".preview-footnotes-body");
    const li = doc.createElement("li");
    li.id = `fn-${id}`;
    if (body) {
      while (body.firstChild) li.appendChild(body.firstChild);
    }
    const back = doc.createElement("a");
    back.href = `#fnref-${id}`;
    back.className = "footnote-back";
    back.textContent = "↩";
    li.appendChild(doc.createTextNode(" "));
    li.appendChild(back);
    list.appendChild(li);
  }
  section.replaceWith(list);
}

/**
 * HTML for a publish target. `text/plain` on the clipboard should stay the
 * source markdown; this HTML is the rich-paste payload.
 */
export function htmlForPublishTarget(
  markdown: string,
  target: PublishCopyTarget
): { title: string; html: string } {
  const preview = buildPublicationPreview(markdown);
  const prepared = preparePublicationBody(markdown);
  if (!prepared) {
    return { title: preview.title, html: withTitle(preview.title, preview.bodyHtml) };
  }
  if (target === "medium") formatMedium(prepared.doc, prepared.root);
  else formatSubstack(prepared.doc, prepared.root);
  return {
    title: prepared.title,
    html: withTitle(prepared.title, prepared.root.innerHTML),
  };
}

/** @deprecated Use htmlForPublishTarget(md, "substack") */
export function clipboardHtmlFromMarkdown(markdown: string): {
  title: string;
  html: string;
} {
  return htmlForPublishTarget(markdown, "substack");
}
