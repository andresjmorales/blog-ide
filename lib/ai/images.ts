/**
 * Essay images for the AI assistant's optional "Images" attachment.
 *
 * https images go to the provider by URL (the provider downloads them), so
 * the request to our proxy stays small. `data:` images are sent inline.
 * Relative paths (e.g. `assets/…` from an import) are not reachable and skipped.
 */

export type ChatImagePart =
  | { type: "image"; source: "url"; url: string }
  | { type: "image"; source: "base64"; mediaType: string; data: string };

/** Provider-side caps are higher; this keeps cost and latency sane. */
export const MAX_CHAT_IMAGES = 8;
const MAX_INLINE_BYTES = 3_500_000;
const SUPPORTED_MEDIA = /^image\/(png|jpe?g|gif|webp)$/i;

const MARKDOWN_IMAGE_RE = /!\[[^\]]*\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g;
const HTML_IMAGE_RE = /<img\b[^>]*\bsrc=["']([^"']+)["']/gi;

/** Image sources in document order, de-duplicated. */
export function extractImageSources(markdown: string): string[] {
  const found: Array<{ at: number; src: string }> = [];
  for (const re of [MARKDOWN_IMAGE_RE, HTML_IMAGE_RE]) {
    const pattern = new RegExp(re.source, re.flags);
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(markdown)) !== null) {
      found.push({ at: match.index, src: match[1] });
    }
  }
  found.sort((x, y) => x.at - y.at);
  return [...new Set(found.map((item) => item.src))];
}

export function imagePartForSource(src: string): ChatImagePart | null {
  if (/^https:\/\//i.test(src)) {
    return { type: "image", source: "url", url: src };
  }
  const data = /^data:([^;,]+);base64,(.+)$/i.exec(src);
  if (data && SUPPORTED_MEDIA.test(data[1])) {
    // base64 → bytes is ~3/4 of the string length.
    if (data[2].length * 0.75 > MAX_INLINE_BYTES) return null;
    return {
      type: "image",
      source: "base64",
      mediaType: data[1].toLowerCase().replace(/^image\/jpg$/, "image/jpeg"),
      data: data[2],
    };
  }
  return null;
}

/** Image parts to attach, plus how many were skipped (unreachable or over cap). */
export function essayImageParts(markdown: string): {
  parts: ChatImagePart[];
  skipped: number;
} {
  const sources = extractImageSources(markdown);
  const parts: ChatImagePart[] = [];
  let skipped = 0;
  for (const src of sources) {
    const part = imagePartForSource(src);
    if (!part || parts.length >= MAX_CHAT_IMAGES) {
      skipped += 1;
      continue;
    }
    parts.push(part);
  }
  return { parts, skipped };
}
