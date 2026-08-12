/**
 * Source-specific readable extracts for the pin/reader surface.
 * Generic article/main stripping remains the fallback.
 */

import { decodeHtmlEntities } from "@/lib/preview/htmlEntities";

const MAX_CHARS = 12_000;

function stripChrome(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ");
}

function htmlToText(html: string): string {
  return decodeHtmlEntities(
    html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n\n")
      .replace(/<\/h[1-6]>/gi, "\n\n")
      .replace(/<\/li>/gi, "\n")
      .replace(/<li\b[^>]*>/gi, "• ")
      .replace(/<[^>]+>/g, " ")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .replace(/[ \t]{2,}/g, " ")
      .trim()
  );
}

function firstMatch(html: string, patterns: RegExp[]): string | null {
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]?.trim()) return match[1];
  }
  return null;
}

export type ReaderHostKind = "wikipedia" | "lesswrong" | "generic";

export function classifyReaderHost(pageUrl: string): ReaderHostKind {
  try {
    const host = new URL(pageUrl).hostname.toLowerCase();
    if (
      host === "wikipedia.org" ||
      host.endsWith(".wikipedia.org") ||
      host === "wikimedia.org" ||
      host.endsWith(".wikimedia.org")
    ) {
      return "wikipedia";
    }
    if (
      host === "lesswrong.com" ||
      host.endsWith(".lesswrong.com") ||
      host === "alignmentforum.org" ||
      host.endsWith(".alignmentforum.org")
    ) {
      return "lesswrong";
    }
  } catch {
    /* ignore */
  }
  return "generic";
}

function extractWikipedia(html: string): string | null {
  const cleaned = stripChrome(html)
    .replace(/<table\b[^>]*class="[^"]*\binfobox\b[^"]*"[\s\S]*?<\/table>/gi, " ")
    .replace(/<div\b[^>]*class="[^"]*\bnavbox\b[^"]*"[\s\S]*?<\/div>/gi, " ")
    .replace(/<div\b[^>]*id="toc"[\s\S]*?<\/div>/gi, " ")
    .replace(/<span\b[^>]*class="[^"]*\bmw-editsection\b[^"]*"[\s\S]*?<\/span>/gi, " ")
    .replace(/<sup\b[^>]*class="[^"]*\breference\b[^"]*"[\s\S]*?<\/sup>/gi, "")
    .replace(/<ol\b[^>]*class="[^"]*\breferences\b[^"]*"[\s\S]*?<\/ol>/gi, " ");

  const body = firstMatch(cleaned, [
    /<div\b[^>]*id="mw-content-text"[^>]*>([\s\S]*?)<div\b[^>]*class="[^"]*\bprintfooter\b/i,
    /<div\b[^>]*class="[^"]*\bmw-parser-output\b[^"]*"[^>]*>([\s\S]*?)$/i,
    /<div\b[^>]*id="mw-content-text"[^>]*>([\s\S]*?)$/i,
  ]);
  if (!body) return null;
  const text = htmlToText(body);
  return text || null;
}

function extractLessWrong(html: string): string | null {
  const cleaned = stripChrome(html);
  const body = firstMatch(cleaned, [
    /<div\b[^>]*class="[^"]*\bPostsPage-postContent\b[^"]*"[^>]*>([\s\S]*?)$/i,
    /<div\b[^>]*class="[^"]*\bPostBody\b[^"]*"[^>]*>([\s\S]*?)$/i,
    /<div\b[^>]*class="[^"]*\bpost-content\b[^"]*"[^>]*>([\s\S]*?)$/i,
    /<div\b[^>]*class="[^"]*\bcomment-body\b[^"]*"[^>]*>([\s\S]*?)$/i,
    /<div\b[^>]*id="postBody"[^>]*>([\s\S]*?)$/i,
  ]);
  if (!body) return null;
  // Truncate at likely page chrome after the post.
  const cut = body.split(
    /<div\b[^>]*class="[^"]*\b(PostsPage-footer|comments-node|Layout-mainFooter)/i
  )[0];
  const text = htmlToText(cut);
  return text || null;
}

function extractGeneric(html: string): string {
  const cleaned = stripChrome(html)
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    .replace(/<header[\s\S]*?<\/header>/gi, " ");

  const article =
    cleaned.match(/<article[\s\S]*?<\/article>/i)?.[0] ||
    cleaned.match(/<main[\s\S]*?<\/main>/i)?.[0] ||
    cleaned;

  return htmlToText(article);
}

export function extractMainText(html: string, pageUrl = ""): string {
  const kind = classifyReaderHost(pageUrl);
  let text: string | null = null;
  if (kind === "wikipedia") text = extractWikipedia(html);
  else if (kind === "lesswrong") text = extractLessWrong(html);
  if (!text) text = extractGeneric(html);
  return text.slice(0, MAX_CHARS);
}
