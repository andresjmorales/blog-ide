import Image from "@tiptap/extension-image";
import { Extension, type JSONContent } from "@tiptap/core";

/**
 * Adjacent caption convention (shared with personal-site):
 *
 *   ![alt](src)
 *   Caption on the next line
 *
 * A blank line between image and text means "not a caption".
 */

const IMAGE_LINE_RE =
  /^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"((?:\\.|[^"\\])*)")?\)$/;

const IMAGE_CAPTION_SENTINEL_RE =
  /^\[\[blogide-img:([A-Za-z0-9_-]+):([A-Za-z0-9_-]*):([A-Za-z0-9_-]*):([A-Za-z0-9_-]*)\]\]$/;

/** base64url — safe for URLs with `_`, `%`, `!`, etc. (footnote encoding is not). */
function encodeField(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const base64 =
    typeof btoa === "function"
      ? btoa(binary)
      : Buffer.from(bytes).toString("base64");
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodeField(value: string): string {
  if (!value) return "";
  const padded = value + "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = padded.replace(/-/g, "+").replace(/_/g, "/");
  try {
    const binary =
      typeof atob === "function"
        ? atob(base64)
        : Buffer.from(base64, "base64").toString("binary");
    const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return "";
  }
}

function isCaptionCandidate(line: string): boolean {
  if (!line.trim()) return false;
  if (IMAGE_LINE_RE.test(line)) return false;
  if (IMAGE_CAPTION_SENTINEL_RE.test(line.trim())) return false;
  if (/^#{1,6}[ \t]/.test(line)) return false;
  if (/^(`{3,}|~{3,})/.test(line)) return false;
  if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) return false;
  if (/^>[ \t]/.test(line)) return false;
  if (/^([-*+]|\d+\.)[ \t]/.test(line)) return false;
  return true;
}

function formatImageMarkdown(
  alt: string,
  src: string,
  title: string
): string {
  return title ? `![${alt}](${src} "${title}")` : `![${alt}](${src})`;
}

/**
 * Fold `![](src)\\nCaption` (no blank line) into a sentinel TipTap can parse
 * as a single image node with a caption attr. Blank-line follow-ups are left
 * alone so they stay normal paragraphs.
 */
export function prepareImageCaptions(body: string): string {
  const lines = body.split("\n");
  const out: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i]!;
    const match = line.match(IMAGE_LINE_RE);
    const next = lines[i + 1];

    if (match && next !== undefined && isCaptionCandidate(next)) {
      const alt = match[1] ?? "";
      const src = match[2] ?? "";
      const title = match[3] ?? "";
      out.push(
        `[[blogide-img:${encodeField(src)}:${encodeField(alt)}:${encodeField(title)}:${encodeField(next)}]]`
      );
      i += 2;
      continue;
    }

    out.push(line);
    i += 1;
  }

  return out.join("\n");
}

/** TipTap Image with optional caption attribute + adjacent markdown serialize. */
export const ImageWithCaption = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      caption: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-caption") || "",
        renderHTML: (attributes) => {
          const caption = String(attributes.caption || "").trim();
          return caption ? { "data-caption": caption } : {};
        },
      },
    };
  },

  renderMarkdown(node: JSONContent) {
    const src = String(node.attrs?.src ?? "");
    const alt = String(node.attrs?.alt ?? "");
    const title = String(node.attrs?.title ?? "");
    const caption = String(node.attrs?.caption ?? "").trim();
    const image = formatImageMarkdown(alt, src, title);
    return caption ? `${image}\n${caption}` : image;
  },
});

/**
 * Parses captioned-image sentinels produced by prepareImageCaptions into
 * `image` nodes (keeps stock `image` token handling on ImageWithCaption).
 */
export const ImageCaptionMarkdown = Extension.create({
  name: "imageCaptionMarkdown",

  markdownTokenName: "blogideImg",

  markdownTokenizer: {
    name: "blogideImg",
    level: "block",
    start(src: string) {
      return src.indexOf("[[blogide-img:");
    },
    tokenize(src: string) {
      const match = src.match(
        /^\[\[blogide-img:([A-Za-z0-9_-]+):([A-Za-z0-9_-]*):([A-Za-z0-9_-]*):([A-Za-z0-9_-]*)\]\]/
      );
      if (!match) return undefined;
      return {
        type: "blogideImg",
        raw: match[0],
        src: decodeField(match[1] ?? ""),
        alt: decodeField(match[2] ?? ""),
        title: decodeField(match[3] ?? ""),
        caption: decodeField(match[4] ?? ""),
      };
    },
  },

  parseMarkdown(token, helpers) {
    const title = typeof token.title === "string" ? token.title : "";
    return helpers.createNode("image", {
      src: typeof token.src === "string" ? token.src : "",
      alt: typeof token.alt === "string" ? token.alt : "",
      title: title || null,
      caption: typeof token.caption === "string" ? token.caption : "",
    });
  },
});
