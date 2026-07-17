import { generateHTML } from "@tiptap/core";
import { createExtensions } from "@/lib/editor/extensions";
import { parseBody } from "@/lib/markdown/pipeline";
import { splitFrontmatter } from "@/lib/markdown/frontmatter";
import { parseTitle } from "@/lib/markdown/titleFrontmatter";
import { parseSubtitle } from "@/lib/markdown/subtitle";

const PREVIEW_EXTENSIONS = createExtensions();

export type PublicationPreview = {
  title: string;
  subtitle: string | null;
  /** Body HTML with numbered footnote refs + endnotes section. */
  bodyHtml: string;
};

/** Plain text for hover tips (strip light markdown noise). */
function footnoteTipText(markdown: string): string {
  return markdown
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_`~]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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
  const notes: { n: number; tip: string; html: string }[] = [];

  refs.forEach((sup, index) => {
    const n = index + 1;
    const content = sup.getAttribute("data-content") || "";
    const tip = footnoteTipText(content) || "Empty footnote";
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
    link.setAttribute("data-tip", tip);
    link.setAttribute("aria-label", `Footnote ${n}`);
    sup.replaceChildren(link);
    sup.id = `fnref-${n}`;
    sup.removeAttribute("title");
    notes.push({ n, tip, html: noteHtml });
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
 * Build publication HTML: numbered superscripts, hover tip text, and a
 * Substack-style footnotes list at the bottom.
 */
export function buildPublicationPreview(markdown: string): PublicationPreview {
  const { frontmatter, body } = splitFrontmatter(markdown || "");
  const title = parseTitle(frontmatter) || "Untitled";
  const subtitle = parseSubtitle(frontmatter);

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
      bodyHtml: `<p class="text-muted">Could not render preview.</p>`,
    };
  }

  if (!rawHtml) {
    return {
      title,
      subtitle,
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
    bodyHtml: enhancePublicationFootnotes(rawHtml, renderNoteHtml),
  };
}

/** Full HTML document for opening Preview in a new browser tab. */
export function buildPublicationDocument(markdown: string): string {
  const { title, subtitle, bodyHtml } = buildPublicationPreview(markdown);
  const sub = subtitle
    ? `<p class="document-preview-subtitle">${escapeHtml(subtitle)}</p>`
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
    color: var(--muted); font-size: 1.1rem; margin: 0 0 1.5rem;
  }
  .editor-prose p { margin: 0 0 1em; }
  .editor-prose h2, .editor-prose h3 { margin: 1.6em 0 0.6em; line-height: 1.25; }
  .editor-prose img { max-width: 100%; height: auto; }
  .editor-prose blockquote {
    border-left: 3px solid var(--border); margin: 1em 0; padding-left: 1em; color: var(--muted);
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
    vertical-align: super;
  }
  .preview-fn-ref:hover::after,
  .preview-fn-ref:focus-visible::after {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 6px;
    bottom: calc(100% + 6px);
    box-shadow: 0 8px 24px rgb(0 0 0 / 14%);
    color: var(--foreground);
    content: attr(data-tip);
    font-size: 0.85rem;
    font-weight: 400;
    left: 50%;
    line-height: 1.4;
    max-width: 16rem;
    padding: 0.45rem 0.6rem;
    position: absolute;
    transform: translateX(-50%);
    white-space: normal;
    width: max-content;
    z-index: 5;
  }
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
</style>
</head>
<body>
  <div class="document-preview">
    <article class="document-preview-article editor-prose">
      <h1 class="document-preview-title">${escapeHtml(title)}</h1>
      ${sub}
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
  const win = window.open(url, "_blank", "noopener,noreferrer");
  if (!win) {
    URL.revokeObjectURL(url);
    throw new Error("Pop-up blocked. Allow pop-ups to open Preview.");
  }
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
