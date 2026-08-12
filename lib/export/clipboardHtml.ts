/**
 * Clipboard HTML for Substack / Docs paste: numbered footnote anchors plus
 * an endnotes block, without hover-tip chrome.
 */

import { buildPublicationPreview } from "@/lib/preview/publicationHtml";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Turn publication preview HTML into paste-friendly markup:
 * Substack-style `footnote-anchor` / `#footnote-N` pairs and a footnotes list.
 * Hover tips are stripped so they do not paste as extra blobs.
 */
export function clipboardHtmlFromMarkdown(markdown: string): {
  title: string;
  html: string;
} {
  const preview = buildPublicationPreview(markdown);
  if (typeof DOMParser === "undefined") {
    return { title: preview.title, html: preview.bodyHtml };
  }

  const doc = new DOMParser().parseFromString(
    `<div id="root">${preview.bodyHtml}</div>`,
    "text/html"
  );
  const root = doc.getElementById("root");
  if (!root) return { title: preview.title, html: preview.bodyHtml };

  root.querySelectorAll(".preview-fn-tip").forEach((el) => el.remove());

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
  if (section) {
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

  const title = preview.title?.trim();
  const body = root.innerHTML;
  const html = title
    ? `<h1>${escapeHtml(title)}</h1>\n${body}`
    : body;
  return { title: preview.title, html };
}
