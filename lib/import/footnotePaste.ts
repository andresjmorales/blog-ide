/**
 * Convert Substack / Docs / Word-style footnote hyperlinks in pasted HTML
 * into BlogIDE <sup data-footnote-ref> atoms, and strip trailing definition
 * blocks from the paste.
 *
 * Also repairs already-pasted markdown where empty [^n] body refs are paired
 * with a trailing "definitions zone" of bare [^n] markers + note paragraphs
 * (the failure mode when definition back-links were treated as new footnotes).
 */

import { createFootnoteId } from "@/lib/editor/footnote";

/** In-body ref → definition target (#footnote-1, #fn-1). Not #footnote-anchor-1. */
const DEF_HREF_RE =
  /#(?:footnote|fn|user-content-fn)-(?!anchor)([A-Za-z0-9]+)/i;

/** Back-link from a definition up to the in-body anchor. */
const BACK_HREF_RE =
  /#(?:footnote-anchor|user-content-fnref|fnref)[-_]?([A-Za-z0-9]+)/i;

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function textOf(el: Element): string {
  return (el.textContent ?? "").replace(/\s+/g, " ").trim();
}

/**
 * Convert a footnote definition DOM fragment to markdown so links and
 * basic emphasis survive Substack/HTML paste into attrs.content.
 */
function htmlFragmentToMarkdown(root: Element): string {
  function walk(node: Node): string {
    if (node.nodeType === Node.TEXT_NODE) {
      return (node.textContent ?? "").replace(/\s+/g, " ");
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return "";
    const el = node as Element;
    const tag = el.tagName.toLowerCase();
    if (tag === "script" || tag === "style") return "";
    if (tag === "br") return "\n";

    const children = [...el.childNodes].map(walk).join("");

    if (tag === "a") {
      if (isBackReferenceAnchor(el)) return "";
      const href = (el.getAttribute("href") ?? "").trim();
      const label = children.replace(/\s+/g, " ").trim();
      if (!label) return "";
      // Number-only back/jump markers (often left after class cleanup).
      if (/^\[?\d+\]?$/.test(label) && (!href || href.startsWith("#"))) {
        return "";
      }
      if (href && !href.startsWith("#")) return `[${label}](${href})`;
      return label;
    }
    if (tag === "strong" || tag === "b") {
      const inner = children.trim();
      return inner ? `**${inner}**` : "";
    }
    if (tag === "em" || tag === "i") {
      const inner = children.trim();
      return inner ? `*${inner}*` : "";
    }
    if (tag === "code") {
      const inner = (el.textContent ?? "").replace(/`/g, "\\`");
      return inner ? `\`${inner}\`` : "";
    }
    if (tag === "p" || tag === "div" || tag === "li" || tag === "section") {
      const inner = children.replace(/[ \t]+\n/g, "\n").trim();
      return inner ? `${inner}\n\n` : "";
    }
    return children;
  }

  return walk(root)
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function labelFromDefHref(href: string): string | null {
  return href.match(DEF_HREF_RE)?.[1] ?? null;
}

function isBackReferenceAnchor(el: Element): boolean {
  if (!(el instanceof HTMLAnchorElement)) return false;
  const href = el.getAttribute("href") ?? "";
  if (BACK_HREF_RE.test(href)) return true;
  const cls = el.className?.toString() ?? "";
  return /footnote-back|footnote__back|reversefootnote/i.test(cls);
}

function isFootnoteRefAnchor(el: Element): boolean {
  if (!(el instanceof HTMLAnchorElement)) return false;
  if (isBackReferenceAnchor(el)) return false;

  const href = el.getAttribute("href") ?? "";
  if (labelFromDefHref(href)) return true;

  const cls = el.className?.toString() ?? "";
  const name = el.getAttribute("data-component-name") ?? "";
  // Substack body anchors often use class/id footnote-anchor + href #footnote-N
  // (href already handled). Treat class-only matches as refs only outside defs.
  return (
    /(?:^|\s)(?:footnote-anchor|footnote__ref|footnote-ref)(?:\s|$)/i.test(
      cls
    ) ||
    /FootnoteAnchor/i.test(name) ||
    el.id?.startsWith("footnote-anchor") === true
  );
}

function isInsideDefinitionBlock(el: Element): boolean {
  return Boolean(
    el.closest(
      [
        "ol.footnotes",
        "section.footnotes",
        ".footnotes",
        ".footnote-definitions",
        "[data-component-name*='FootnoteList']",
        "[data-component-name*='Footnotes']",
        "[id^='footnote-']:not([id^='footnote-anchor'])",
      ].join(",")
    )
  );
}

function findDefinition(
  doc: Document,
  label: string
): { element: Element; text: string } | null {
  const candidates = [
    `#footnote-${label}`,
    `#fn-${label}`,
    `#fn${label}`,
    `#user-content-fn-${label}`,
    `[id="footnote-${label}"]`,
    `li[id$="footnote-${label}"]`,
    `li[id$="fn-${label}"]`,
  ];
  for (const selector of candidates) {
    try {
      const el = doc.querySelector(selector);
      if (!el || isFootnoteRefAnchor(el)) continue;
      const block =
        el.closest("li, div.footnote, section, aside, div") ??
        el.parentElement ??
        el;
      const clone = block.cloneNode(true) as Element;
      clone.querySelectorAll("a").forEach((a) => {
        if (isBackReferenceAnchor(a)) a.remove();
        else if (/^\[?\d+\]?$/.test(textOf(a))) a.remove();
      });
      let text = htmlFragmentToMarkdown(clone);
      text = text.replace(new RegExp(`^\\s*${label}[.)]?\\s*`), "").trim();
      if (text) return { element: block, text };
    } catch {
      // invalid selector — ignore
    }
  }
  return null;
}

/**
 * Transform clipboard HTML so footnote anchors become BlogIDE footnote refs.
 */
export function transformPastedFootnoteHtml(html: string): string {
  if (typeof DOMParser === "undefined") return html;
  if (!/footnote|#fn/i.test(html)) return html;

  const doc = new DOMParser().parseFromString(html, "text/html");
  const anchors = [...doc.querySelectorAll("a")].filter(
    (a) => isFootnoteRefAnchor(a) && !isInsideDefinitionBlock(a)
  );
  if (anchors.length === 0) return html;

  const defElements = new Set<Element>();
  const contentByLabel = new Map<string, string>();

  for (const anchor of anchors) {
    const href = anchor.getAttribute("href") ?? "";
    const label =
      labelFromDefHref(href) ||
      (anchor.id?.match(/(\d+)$/)?.[1] ?? null) ||
      textOf(anchor).replace(/[^\w]/g, "") ||
      "1";

    let content = contentByLabel.get(label) ?? "";
    if (!content) {
      const def = findDefinition(doc, label);
      if (def) {
        content = def.text;
        contentByLabel.set(label, content);
        defElements.add(def.element);
      }
    }

    const sup = doc.createElement("sup");
    sup.setAttribute("data-footnote-ref", "");
    sup.setAttribute("data-id", createFootnoteId());
    sup.setAttribute("data-content", escapeAttr(content));
    sup.textContent = label;
    anchor.replaceWith(sup);
  }

  for (const el of defElements) {
    el.remove();
  }
  doc
    .querySelectorAll(
      [
        "ol.footnotes",
        "section.footnotes",
        ".footnotes",
        ".footnote-definitions",
        "[data-component-name*='FootnoteList']",
        "[data-component-name*='Footnotes']",
      ].join(",")
    )
    .forEach((el) => el.remove());

  return doc.body.innerHTML;
}

const BARE_FN_LINE_RE = /^\[\^([^\]]+)\]\s*:?\s*$/;
const GFM_DEF_LINE_RE = /^\[\^([^\]]+)\]:\s*(.*)$/;

/**
 * Repair the doubled-footnote Substack import shape:
 *
 *   prose with [^1] … [^n]
 *
 *   [^1]
 *
 *   note body paragraph(s)
 *
 *   [^2]
 *
 *   …
 *
 * Bare trailing markers become real `[^n]: …` definitions and are removed
 * from the body so they are not parsed as extra empty footnote refs.
 */
export function repairSplitFootnoteMarkdown(markdown: string): {
  markdown: string;
  repaired: number;
} {
  const source = markdown.replace(/\r\n/g, "\n");
  const lines = source.split("\n");

  const bodyLabels = new Set<string>();
  for (const line of lines) {
    if (BARE_FN_LINE_RE.test(line) || GFM_DEF_LINE_RE.test(line)) continue;
    for (const match of line.matchAll(/\[\^([^\]]+)\]/g)) {
      bodyLabels.add(match[1]);
    }
  }
  if (bodyLabels.size === 0) {
    return { markdown, repaired: 0 };
  }

  let zoneStart = -1;
  for (let i = 0; i < lines.length; i += 1) {
    const bare = lines[i].match(BARE_FN_LINE_RE);
    if (!bare || !bodyLabels.has(bare[1])) continue;

    const rest = lines.slice(i);
    const looksLikeZone = rest.every((line) => {
      if (BARE_FN_LINE_RE.test(line)) return true;
      if (GFM_DEF_LINE_RE.test(line)) return true;
      if (line.trim() === "") return true;
      // Essay headings mean we have not reached a pure definitions zone.
      if (/^#{1,6}\s/.test(line)) return false;
      return true;
    });

    const zoneLabels = new Set(
      rest
        .map((line) => line.match(BARE_FN_LINE_RE)?.[1])
        .filter((x): x is string => Boolean(x))
    );
    let overlap = 0;
    for (const label of bodyLabels) {
      if (zoneLabels.has(label)) overlap += 1;
    }
    if (looksLikeZone && overlap >= Math.min(2, bodyLabels.size)) {
      zoneStart = i;
      break;
    }
  }

  if (zoneStart < 0) {
    return { markdown, repaired: 0 };
  }

  const head = lines.slice(0, zoneStart);
  const zone = lines.slice(zoneStart);
  const defs = new Map<string, string>();

  for (const line of head) {
    const gfm = line.match(GFM_DEF_LINE_RE);
    if (gfm && gfm[2].trim()) defs.set(gfm[1], gfm[2].trim());
  }

  let i = 0;
  let repaired = 0;
  while (i < zone.length) {
    const bare = zone[i].match(BARE_FN_LINE_RE);
    const gfm = zone[i].match(GFM_DEF_LINE_RE);
    const label = bare?.[1] ?? (gfm && !gfm[2].trim() ? gfm[1] : null);
    if (!label) {
      i += 1;
      continue;
    }
    i += 1;
    while (i < zone.length && zone[i].trim() === "") i += 1;
    const chunks: string[] = [];
    if (gfm?.[2]?.trim()) chunks.push(gfm[2].trim());
    while (i < zone.length) {
      if (BARE_FN_LINE_RE.test(zone[i])) break;
      if (GFM_DEF_LINE_RE.test(zone[i])) break;
      chunks.push(zone[i]);
      i += 1;
    }
    const content = chunks.join("\n").replace(/^\n+|\n+$/g, "").trim();
    if (content && !defs.get(label)) {
      defs.set(label, content);
      repaired += 1;
    }
  }

  if (repaired === 0) {
    return { markdown, repaired: 0 };
  }

  const cleanedHead = head
    .filter((line) => !GFM_DEF_LINE_RE.test(line))
    .join("\n")
    .replace(/\n+$/, "\n");

  const ordered = [...bodyLabels].sort(
    (a, b) => Number(a) - Number(b) || a.localeCompare(b)
  );
  const defBlock = ordered
    .filter((label) => defs.has(label))
    .map((label) => `[^${label}]: ${defs.get(label)}`)
    .join("\n");

  return {
    markdown: `${cleanedHead}\n${defBlock}\n`,
    repaired,
  };
}

/**
 * Convert already-pasted markdown footnote hyperlinks into GFM footnotes.
 * Handles patterns like `[1](#footnote-1)` plus trailing definition lines/blocks.
 * Also repairs the split bare-[^n] + paragraph shape left by bad pastes.
 */
export function convertMarkdownFootnoteLinks(markdown: string): {
  markdown: string;
  converted: number;
} {
  const split = repairSplitFootnoteMarkdown(markdown);
  if (split.repaired > 0) {
    return { markdown: split.markdown, converted: split.repaired };
  }

  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const defs = new Map<string, string>();

  for (const line of lines) {
    const gfm = line.match(/^\[\^([^\]]+)\]:\s*(.*)$/);
    if (gfm) {
      defs.set(gfm[1], gfm[2]);
    }
  }

  const bodyLinkLabels = new Set<string>();
  const source = markdown.replace(/\r\n/g, "\n");
  const linkRe =
    /\[([^\]]*)\]\(([^)]*#(?:footnote|fn|user-content-fn)-(?!anchor)([A-Za-z0-9]+))\)/gi;
  let match: RegExpExecArray | null;
  while ((match = linkRe.exec(source))) {
    bodyLinkLabels.add(match[3]);
  }

  if (bodyLinkLabels.size === 0) {
    return { markdown, converted: 0 };
  }

  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i];
    const numbered = line.match(/^(\d+)[.)]\s+(.+)$/);
    if (numbered && bodyLinkLabels.has(numbered[1]) && !defs.has(numbered[1])) {
      defs.set(numbered[1], numbered[2].trim());
    }
  }

  // Number-only marker lines: "1" then following paragraphs until next marker.
  for (let i = 0; i < lines.length; i += 1) {
    const alone = lines[i].match(/^(\d+)$/);
    if (!alone || !bodyLinkLabels.has(alone[1]) || defs.has(alone[1])) continue;
    let j = i + 1;
    while (j < lines.length && lines[j].trim() === "") j += 1;
    const chunks: string[] = [];
    while (
      j < lines.length &&
      !/^\d+$/.test(lines[j]) &&
      !/^(\d+)[.)]\s+/.test(lines[j]) &&
      !BARE_FN_LINE_RE.test(lines[j])
    ) {
      chunks.push(lines[j]);
      j += 1;
    }
    const content = chunks.join("\n").trim();
    if (content) defs.set(alone[1], content);
  }

  let converted = 0;
  let next = source.replace(linkRe, (_full, _text, _url, label: string) => {
    converted += 1;
    return `[^${label}]`;
  });

  const labelsWithDefs = [...bodyLinkLabels].filter((label) => defs.has(label));
  if (labelsWithDefs.length === 0) {
    return { markdown: next, converted };
  }

  const defBlock = labelsWithDefs
    .sort((a, b) => Number(a) - Number(b) || a.localeCompare(b))
    .map((label) => `[^${label}]: ${defs.get(label) ?? ""}`)
    .join("\n");

  const strippedLines = next.split("\n").filter((line) => {
    const numbered = line.match(/^(\d+)[.)]\s+(.+)$/);
    if (numbered && bodyLinkLabels.has(numbered[1])) return false;
    return true;
  });

  let cut = strippedLines.length;
  for (let i = 0; i < strippedLines.length; i += 1) {
    if (
      /^\d+$/.test(strippedLines[i]) &&
      bodyLinkLabels.has(strippedLines[i])
    ) {
      cut = i;
      break;
    }
  }

  next = `${strippedLines.slice(0, cut).join("\n").replace(/\n+$/, "\n")}\n${defBlock}\n`;

  return { markdown: next, converted };
}
