import type { JSONContent } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { canonicalizeLibraryUrl } from "@/lib/library/urls";

export type EssayLinkedUrl = {
  url: string;
  canonical: string;
  title: string;
  host: string;
  count: number;
  firstPos: number;
  inBody: boolean;
  inFootnote: boolean;
};

const MARKDOWN_LINK_RE =
  /(?<!!)\[([^\]]*)\]\(\s*<?([^>\s)]+)>?(?:\s+"[^"]*")?\s*\)/g;
const ANGLE_AUTOLINK_RE = /<(https?:\/\/[^>\s]+)>/g;
const BARE_URL_RE = /(?<![\w./<])(https?:\/\/[^\s)<\]"']+)/g;
const TRAILING_URL_PUNCT_RE = /[.,;:!?)>]+$/;

function isHttpUrl(raw: string): string | null {
  const url = raw.trim().replace(TRAILING_URL_PUNCT_RE, "");
  if (!/^https?:\/\//i.test(url)) return null;
  return url;
}

export function hostOfUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

function addHit(
  map: Map<string, EssayLinkedUrl>,
  raw: string,
  title: string,
  pos: number,
  where: "body" | "footnote"
): void {
  const href = isHttpUrl(raw);
  if (!href) return;
  const canonical = canonicalizeLibraryUrl(href) ?? href;
  const existing = map.get(canonical);
  if (existing) {
    existing.count += 1;
    if (where === "footnote") existing.inFootnote = true;
    else existing.inBody = true;
    const label = title.trim();
    if (label && label !== href && existing.title === existing.host) {
      existing.title = label;
    }
    return;
  }
  const label = title.trim();
  map.set(canonical, {
    url: href,
    canonical,
    title: label && label !== href ? label : hostOfUrl(href),
    host: hostOfUrl(href),
    count: 1,
    firstPos: pos,
    inBody: where === "body",
    inFootnote: where === "footnote",
  });
}

function rangeOverlaps(
  ranges: Array<[number, number]>,
  start: number,
  end: number
): boolean {
  return ranges.some(([from, to]) => start < to && end > from);
}

function collectMarkdownHttpLinks(
  text: string,
  pos: number,
  map: Map<string, EssayLinkedUrl>,
  where: "body" | "footnote"
): void {
  if (!text) return;
  const claimed: Array<[number, number]> = [];
  for (const match of text.matchAll(MARKDOWN_LINK_RE)) {
    const start = match.index ?? 0;
    claimed.push([start, start + match[0].length]);
    addHit(map, match[2] ?? "", match[1] ?? "", pos, where);
  }
  for (const match of text.matchAll(ANGLE_AUTOLINK_RE)) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    if (rangeOverlaps(claimed, start, end)) continue;
    claimed.push([start, end]);
    addHit(map, match[1] ?? "", "", pos, where);
  }
  for (const match of text.matchAll(BARE_URL_RE)) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    if (rangeOverlaps(claimed, start, end)) continue;
    addHit(map, match[1] ?? "", "", pos, where);
  }
}

function collectFromPm(
  doc: ProseMirrorNode,
  map: Map<string, EssayLinkedUrl>
): void {
  doc.descendants((node, pos) => {
    if (node.type.name === "footnoteRef") {
      collectMarkdownHttpLinks(
        String(node.attrs.content ?? ""),
        pos,
        map,
        "footnote"
      );
      return true;
    }
    if (!node.isText || !node.text) return true;
    const link = node.marks.find((mark) => mark.type.name === "link");
    if (link) {
      addHit(map, String(link.attrs.href ?? ""), node.text, pos, "body");
      return true;
    }
    collectMarkdownHttpLinks(node.text, pos, map, "body");
    return true;
  });
}

function collectFromJson(
  doc: JSONContent,
  map: Map<string, EssayLinkedUrl>
): void {
  let pos = 0;
  function visit(node: JSONContent) {
    if (node.type === "footnoteRef") {
      collectMarkdownHttpLinks(
        String(node.attrs?.content ?? ""),
        pos,
        map,
        "footnote"
      );
    }
    const href = node.marks?.find((mark) => mark.type === "link")?.attrs?.href;
    if (node.type === "text" && typeof href === "string") {
      addHit(map, href, node.text ?? "", pos, "body");
    } else if (node.type === "text" && typeof node.text === "string") {
      collectMarkdownHttpLinks(node.text, pos, map, "body");
    }
    node.content?.forEach(visit);
    pos += 1;
  }
  visit(doc);
}

/**
 * Unique http(s) hyperlinks in the essay body and footnote markdown.
 * Image destinations are skipped. Count is how many times that URL appears.
 */
export function listEssayLinkedUrls(
  doc: ProseMirrorNode | JSONContent
): EssayLinkedUrl[] {
  const map = new Map<string, EssayLinkedUrl>();
  if (doc && typeof doc === "object" && "descendants" in doc) {
    collectFromPm(doc as ProseMirrorNode, map);
  } else {
    collectFromJson(doc as JSONContent, map);
  }
  return [...map.values()].sort((a, b) => {
    if (a.firstPos !== b.firstPos) return a.firstPos - b.firstPos;
    return a.host.localeCompare(b.host);
  });
}
