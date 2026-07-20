import { generateHTML } from "@tiptap/core";
import { createExtensions } from "@/lib/editor/extensions";
import { parseBody } from "@/lib/markdown/pipeline";
import { splitFrontmatter } from "@/lib/markdown/frontmatter";
import { parseTitle } from "@/lib/markdown/titleFrontmatter";
import { parseSubtitle } from "@/lib/markdown/subtitle";
import { parseAuthor } from "@/lib/markdown/author";

const PREVIEW_EXTENSIONS = createExtensions();

export type PublicationPreview = {
  title: string;
  subtitle: string | null;
  author: string | null;
  /** Body HTML with numbered footnote refs + endnotes section. */
  bodyHtml: string;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Hover tips sit mid-paragraph, so tip markup must be phrasing-only.
 * Block tags like `<p>` get hoisted by the browser and leave an empty tip shell.
 */
export function toInlineTipHtml(noteHtml: string, doc?: Document): string {
  const owner =
    doc ??
    (typeof DOMParser !== "undefined"
      ? new DOMParser().parseFromString("<div></div>", "text/html")
      : null);
  if (!owner) {
    return noteHtml.replace(/<\/?p\b[^>]*>/gi, "").trim();
  }

  const wrap = owner.createElement("div");
  wrap.innerHTML = noteHtml.trim();
  const parts: string[] = [];

  for (const node of [...wrap.childNodes]) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? "";
      if (text.trim()) parts.push(text);
      continue;
    }
    if (!(node instanceof HTMLElement)) continue;

    const tag = node.tagName.toLowerCase();
    if (tag === "p" || tag === "div") {
      const inner = node.innerHTML.trim();
      if (inner) parts.push(inner);
      continue;
    }
    if (tag === "ul" || tag === "ol") {
      const items = [...node.querySelectorAll(":scope > li")];
      parts.push(
        items
          .map((li, i) =>
            tag === "ol" ? `${i + 1}. ${li.innerHTML}` : `• ${li.innerHTML}`
          )
          .join("<br>")
      );
      continue;
    }
    if (tag === "pre" || tag === "blockquote") {
      const text = (node.textContent || "").trim();
      if (text) parts.push(escapeHtml(text));
      continue;
    }
    parts.push(node.outerHTML);
  }

  // Paragraph gap (not a single <br>) so multi-line notes stay readable.
  const joined = parts.filter(Boolean).join("<br><br>");
  if (joined) return joined;
  const fallback = (wrap.textContent || "").trim();
  return fallback ? escapeHtml(fallback) : "";
}

/**
 * TipTap generateHTML emits <img data-caption="…">; turn those into
 * <figure>/<figcaption> for Preview (and any other HTML consumers).
 */
export function enhancePublicationCaptions(rawHtml: string): string {
  if (!rawHtml || typeof DOMParser === "undefined") return rawHtml;

  const doc = new DOMParser().parseFromString(
    `<div id="root">${rawHtml}</div>`,
    "text/html"
  );
  const root = doc.getElementById("root");
  if (!root) return rawHtml;

  for (const img of [
    ...root.querySelectorAll("img[data-caption]"),
  ] as HTMLImageElement[]) {
    const caption = (img.getAttribute("data-caption") || "").trim();
    if (!caption) {
      img.removeAttribute("data-caption");
      continue;
    }
    if (img.closest("figure")) {
      img.removeAttribute("data-caption");
      continue;
    }

    const figure = doc.createElement("figure");
    figure.className = "content-figure";
    const figcaption = doc.createElement("figcaption");
    figcaption.className = "content-caption";
    figcaption.textContent = caption;
    img.removeAttribute("data-caption");
    img.parentNode?.insertBefore(figure, img);
    figure.appendChild(img);
    figure.appendChild(figcaption);
  }

  return root.innerHTML;
}

/**
 * Turn TipTap footnote `?` markers into numbered refs + endnotes list.
 * Pure DOM transform — testable without the TipTap generateHTML path.
 */
export function enhancePublicationFootnotes(
  rawHtml: string,
  renderNoteHtml: (markdown: string) => string = (md) =>
    `<p>${escapeHtml(md)}</p>`
): string {
  if (!rawHtml || typeof DOMParser === "undefined") return rawHtml;

  const doc = new DOMParser().parseFromString(
    `<div id="root">${rawHtml}</div>`,
    "text/html"
  );
  const root = doc.getElementById("root");
  if (!root) return rawHtml;

  const refs = [
    ...root.querySelectorAll("sup[data-footnote-ref]"),
  ] as HTMLElement[];
  const notes: { n: number; html: string }[] = [];

  refs.forEach((sup, index) => {
    const n = index + 1;
    const content = sup.getAttribute("data-content") || "";
    let noteHtml = "";
    try {
      noteHtml = content.trim() ? renderNoteHtml(content.trim()) : "<p></p>";
    } catch {
      noteHtml = `<p>${escapeHtml(content)}</p>`;
    }

    const link = doc.createElement("a");
    link.href = `#fn-${n}`;
    link.className = "preview-fn-ref";
    link.textContent = String(n);
    link.setAttribute("data-fn", String(n));
    link.setAttribute("aria-label", `Footnote ${n}`);

    // Real HTML tip (CSS attr() cannot carry formatting / clickable links).
    // Use a <span> wrapper + inline tip HTML so mid-paragraph reparse
    // does not hoist <p> out of the tip (empty "blob" on hover).
    const tip = doc.createElement("span");
    tip.className = "preview-fn-tip";
    tip.setAttribute("role", "tooltip");
    const tipHtml = content.trim() ? toInlineTipHtml(noteHtml, doc) : "";
    if (tipHtml) {
      tip.innerHTML = tipHtml;
    } else {
      tip.textContent = "Empty footnote";
    }

    const wrapper = doc.createElement("span");
    wrapper.id = `fnref-${n}`;
    wrapper.className = "preview-fn";
    wrapper.replaceChildren(link, tip);
    sup.replaceWith(wrapper);
    notes.push({ n, html: noteHtml });
  });

  if (notes.length > 0) {
    const section = doc.createElement("section");
    section.className = "preview-footnotes";
    section.setAttribute("aria-label", "Footnotes");
    const heading = doc.createElement("h2");
    heading.className = "preview-footnotes-heading";
    heading.textContent = "Footnotes";
    section.appendChild(heading);
    const list = doc.createElement("ol");
    list.className = "preview-footnotes-list";
    for (const note of notes) {
      const li = doc.createElement("li");
      li.id = `fn-${note.n}`;
      li.className = "preview-footnotes-item";
      li.innerHTML = `<a class="preview-footnotes-back" href="#fnref-${note.n}" aria-label="Back to reference ${note.n}">${note.n}.</a> <div class="preview-footnotes-body">${note.html}</div>`;
      list.appendChild(li);
    }
    section.appendChild(list);
    root.appendChild(section);
  }

  return root.innerHTML;
}

/**
 * Build publication HTML: numbered superscripts, formatted hover tips, and a
 * Substack-style footnotes list at the bottom.
 */
export function buildPublicationPreview(markdown: string): PublicationPreview {
  const { frontmatter, body } = splitFrontmatter(markdown || "");
  const title = parseTitle(frontmatter) || "Untitled";
  const subtitle = parseSubtitle(frontmatter) || null;
  const author = parseAuthor(frontmatter) || null;

  let rawHtml = "";
  try {
    const trimmed = body.trim();
    rawHtml = trimmed
      ? generateHTML(parseBody(trimmed), PREVIEW_EXTENSIONS)
      : "";
  } catch {
    return {
      title,
      subtitle,
      author,
      bodyHtml: `<p class="text-muted">Could not render preview.</p>`,
    };
  }

  if (!rawHtml) {
    return {
      title,
      subtitle,
      author,
      bodyHtml: `<p class="text-muted">Nothing to preview yet.</p>`,
    };
  }

  const renderNoteHtml = (md: string) => {
    try {
      return generateHTML(parseBody(md), PREVIEW_EXTENSIONS);
    } catch {
      return `<p>${escapeHtml(md)}</p>`;
    }
  };

  return {
    title,
    subtitle,
    author,
    bodyHtml: enhancePublicationFootnotes(
      enhancePublicationCaptions(rawHtml),
      renderNoteHtml
    ),
  };
}

/** Full HTML document for opening Preview in a new browser tab. */
export function buildPublicationDocument(markdown: string): string {
  const { title, subtitle, author, bodyHtml } = buildPublicationPreview(
    markdown
  );
  const sub = subtitle
    ? `<p class="document-preview-subtitle">${escapeHtml(subtitle)}</p>`
    : "";
  const byline = author
    ? `<p class="document-preview-author">${escapeHtml(author)}</p>`
    : "";
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)} · Preview</title>
<style>
  /* Always light — publication reading, independent of OS theme. */
  :root {
    --background: #ffffff;
    --foreground: #1c1917;
    --muted: #57534e;
    --border: #e7e5e4;
    --accent: #0f766e;
    --panel: #f5f5f4;
    --target: #ecfdf5;
    color-scheme: light;
  }
  * { box-sizing: border-box; }
  html { scroll-behavior: smooth; }
  body {
    margin: 0;
    background: var(--background);
    color: var(--foreground);
    font-family: Georgia, "Times New Roman", serif;
    line-height: 1.65;
  }
  .document-preview { padding: 2.5rem 1.25rem 4rem; }
  .document-preview-article { max-width: 40rem; margin: 0 auto; }
  .document-preview-title {
    font-size: 2rem; font-weight: 650; line-height: 1.2; margin: 0 0 0.35rem;
  }
  .document-preview-subtitle {
    color: var(--muted); font-size: 1.1rem; margin: 0 0 0.35rem;
  }
  .document-preview-author {
    color: var(--muted); font-size: 0.95rem; margin: 0 0 1.5rem;
  }
  .editor-prose p { margin: 0 0 1em; }
  .editor-prose h2, .editor-prose h3 { margin: 1.6em 0 0.6em; line-height: 1.25; }
  .editor-prose img { max-width: 100%; height: auto; }
  .editor-prose .content-figure { margin: 1.25em 0; }
  .editor-prose .content-figure img { display: block; max-width: 100%; height: auto; margin: 0 auto; }
  .editor-prose .content-caption {
    color: var(--muted);
    font-family: system-ui, sans-serif;
    font-size: 0.9rem;
    line-height: 1.45;
    margin-top: 0.5rem;
    text-align: center;
  }
  .editor-prose ul, .editor-prose ol { margin: 0.75em 0; padding-left: 1.4em; }
  .editor-prose ul { list-style: disc; }
  .editor-prose ol { list-style: decimal; }
  .editor-prose li + li { margin-top: 0.25em; }
  .editor-prose pre {
    background: var(--panel); border: 1px solid var(--border); border-radius: 4px;
    font-family: ui-monospace, monospace; font-size: 0.9em; overflow-x: auto; padding: 0.75em 1em;
  }
  .editor-prose code { font-family: ui-monospace, monospace; font-size: 0.9em; }
  .editor-prose blockquote {
    border-left: 3px solid var(--border); margin: 1em 0; padding-left: 1em; color: var(--muted);
    font-style: normal;
  }
  .editor-prose blockquote em,
  .editor-prose blockquote i { font-style: italic; }
  .preview-fn {
    position: relative;
    font-size: inherit;
    line-height: inherit;
  }
  .preview-fn-ref {
    color: var(--accent);
    cursor: pointer;
    font-family: system-ui, sans-serif;
    font-size: 0.7em;
    font-weight: 700;
    margin: 0 0.08em;
    position: relative;
    text-decoration: none;
    top: -0.45em;
    vertical-align: baseline;
  }
  .preview-fn-tip {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 6px;
    bottom: calc(100% + 6px);
    box-shadow: 0 8px 24px rgb(0 0 0 / 14%);
    color: var(--foreground);
    display: none;
    font-family: Georgia, "Times New Roman", serif;
    font-size: 0.85rem;
    font-weight: 400;
    left: 50%;
    line-height: 1.45;
    max-width: min(20rem, 80vw);
    padding: 0.5rem 0.65rem;
    position: absolute;
    text-align: left;
    transform: translateX(-50%);
    white-space: normal;
    width: max-content;
    z-index: 5;
  }
  /* Invisible bridge so you can move from the marker into the tip. */
  .preview-fn-tip::after {
    content: "";
    height: 12px;
    left: 0;
    position: absolute;
    right: 0;
    top: 100%;
  }
  .preview-fn:hover .preview-fn-tip,
  .preview-fn:focus-within .preview-fn-tip {
    display: block;
  }
  .preview-fn-tip > *:first-child { margin-top: 0; }
  .preview-fn-tip > *:last-child { margin-bottom: 0; }
  .preview-fn-tip p { margin: 0 0 0.45em; }
  .preview-fn-tip a { color: var(--accent); }
  .preview-fn-tip em { font-style: italic; }
  .preview-fn-tip strong { font-weight: 700; }
  .preview-fn-tip code { font-family: ui-monospace, monospace; font-size: 0.9em; }
  .preview-fn-tip ul,
  .preview-fn-tip ol { margin: 0.35em 0; padding-left: 1.2em; }
  .preview-footnotes {
    border-top: 1px solid var(--border);
    font-family: system-ui, sans-serif;
    font-size: 0.875rem;
    margin-top: 2.5rem;
    padding-top: 1.25rem;
  }
  .preview-footnotes-heading {
    font-size: 0.75rem;
    font-weight: 650;
    letter-spacing: 0.06em;
    margin: 0 0 0.75rem;
    text-transform: uppercase;
    color: var(--muted);
  }
  .preview-footnotes-list {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .preview-footnotes-item {
    display: grid;
    gap: 0.35rem 0.5rem;
    grid-template-columns: auto 1fr;
    margin: 0 0 0.85rem;
    border-radius: 4px;
    padding: 0.15rem 0.25rem;
    scroll-margin-top: 2rem;
  }
  .preview-footnotes-item:target {
    background: var(--target);
  }
  [id^="fnref-"] { scroll-margin-top: 2rem; }
  .preview-footnotes-back {
    color: var(--accent);
    font-weight: 650;
    text-decoration: none;
  }
  .preview-footnotes-body > *:first-child { margin-top: 0; }
  .preview-footnotes-body > *:last-child { margin-bottom: 0; }
  .preview-footnotes-body p { margin: 0 0 0.65em; }
  .preview-footnotes-body p:last-child { margin-bottom: 0; }
  .preview-footnotes-body ul,
  .preview-footnotes-body ol { margin: 0.4em 0; padding-left: 1.25em; }
  .preview-footnotes-body ul { list-style: disc; }
  .preview-footnotes-body ol { list-style: decimal; }
  .preview-footnotes-body li + li { margin-top: 0.2em; }
  .preview-footnotes-body pre {
    background: var(--panel); border: 1px solid var(--border); border-radius: 4px;
    font-family: ui-monospace, monospace; font-size: 0.85em; overflow-x: auto; padding: 0.5em 0.65em;
  }
  .preview-footnotes-body blockquote {
    border-left: 2px solid var(--border); color: var(--muted); margin: 0.4em 0; padding-left: 0.65em;
  }
</style>
</head>
<body>
  <div class="document-preview">
    <article class="document-preview-article editor-prose">
      <h1 class="document-preview-title">${escapeHtml(title)}</h1>
      ${sub}
      ${byline}
      <div>${bodyHtml}</div>
    </article>
  </div>
</body>
</html>`;
}

export function openPublicationPreviewTab(markdown: string): void {
  const html = buildPublicationDocument(markdown);
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  // Do not pass noopener/noreferrer as window features: Chromium and Firefox
  // then return null even when the tab opens, which falsely looks blocked.
  const win = window.open(url, "_blank");
  if (!win) {
    URL.revokeObjectURL(url);
    throw new Error("Pop-up blocked. Allow pop-ups to open Preview.");
  }
  win.opener = null;
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
