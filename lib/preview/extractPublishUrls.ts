export type PublishUrlKind = "link" | "image";

export type ExtractedPublishUrl = {
  url: string;
  kind: PublishUrlKind;
};

const MARKDOWN_IMAGE_RE = /!\[[^\]]*]\(\s*<?([^>\s)]+)>?(?:\s+"[^"]*")?\s*\)/g;
const MARKDOWN_LINK_RE = /(?<!!)\[[^\]]*]\(\s*<?([^>\s)]+)>?(?:\s+"[^"]*")?\s*\)/g;
const ANGLE_AUTOLINK_RE = /<(https?:\/\/[^>\s]+)>/g;
const BARE_URL_RE = /(?<![\w./<])(https?:\/\/[^\s)<\]"']+)/g;
/** Trailing sentence punctuation often stuck to bare URLs. */
const TRAILING_URL_PUNCT_RE = /[.,;:!?)>]+$/;

/**
 * Collect http(s) destinations from markdown for a pre-publish check.
 * Relative paths, data: URLs, and footnote refs are skipped (reported separately).
 */
export function extractPublishUrls(markdown: string): {
  httpUrls: ExtractedPublishUrl[];
  relative: ExtractedPublishUrl[];
  skipped: string[];
} {
  const body = markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "");
  const httpMap = new Map<string, PublishUrlKind>();
  const relativeMap = new Map<string, PublishUrlKind>();
  const skipped: string[] = [];

  function consider(raw: string, kind: PublishUrlKind) {
    const url = raw.trim().replace(TRAILING_URL_PUNCT_RE, "");
    if (!url) return;
    if (url.startsWith("data:")) {
      skipped.push(url.slice(0, 48) + (url.length > 48 ? "…" : ""));
      return;
    }
    if (url.startsWith("#") || url.startsWith("mailto:")) {
      skipped.push(url);
      return;
    }
    if (/^https?:\/\//i.test(url)) {
      if (!httpMap.has(url)) httpMap.set(url, kind);
      else if (kind === "image") httpMap.set(url, "image");
      return;
    }
    // Site-relative or other non-http (./assets, /writing/…)
    if (!relativeMap.has(url)) relativeMap.set(url, kind);
    else if (kind === "image") relativeMap.set(url, "image");
  }

  for (const match of body.matchAll(MARKDOWN_IMAGE_RE)) {
    consider(match[1], "image");
  }
  for (const match of body.matchAll(MARKDOWN_LINK_RE)) {
    consider(match[1], "link");
  }
  for (const match of body.matchAll(ANGLE_AUTOLINK_RE)) {
    consider(match[1], "link");
  }
  for (const match of body.matchAll(BARE_URL_RE)) {
    consider(match[1], "link");
  }

  return {
    httpUrls: [...httpMap.entries()].map(([url, kind]) => ({ url, kind })),
    relative: [...relativeMap.entries()].map(([url, kind]) => ({ url, kind })),
    skipped,
  };
}
