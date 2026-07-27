import Image from "@tiptap/extension-image";
import StarterKit from "@tiptap/starter-kit";
import { Markdown, MarkdownManager } from "@tiptap/markdown";
import {
  Extension,
  generateHTML,
  type AnyExtension,
  type JSONContent,
} from "@tiptap/core";
import { LinkShortcut } from "@/lib/editor/linkShortcut";

/**
 * Adjacent caption convention (shared with personal-site):
 *
 *   ![alt](src)
 *   Caption on the next line
 *
 * A blank line between image and text means "not a caption".
 * Captions support bold, italic, and links only (inline markdown).
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

/** Collapse caption markdown to a single adjacent line. */
export function normalizeCaptionMarkdown(md: string): string {
  return md
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join(" ")
    .trim();
}

/**
 * TipTap extension set for caption editing / HTML: paragraph + bold + italic
 * + link only. No block constructs (captions stay one line).
 */
export function createCaptionExtensions(options?: {
  /** Include Ctrl/Cmd+K link shortcut (editor only). */
  withLinkShortcut?: boolean;
}): AnyExtension[] {
  const extensions: AnyExtension[] = [
    StarterKit.configure({
      heading: false,
      bulletList: false,
      orderedList: false,
      listItem: false,
      blockquote: false,
      codeBlock: false,
      code: false,
      strike: false,
      hardBreak: false,
      horizontalRule: false,
      underline: false,
      trailingNode: false,
      link: {
        openOnClick: false,
        autolink: true,
        defaultProtocol: "https",
      },
    }),
    Markdown,
    CaptionSingleLine,
  ];
  if (options?.withLinkShortcut) {
    extensions.push(LinkShortcut);
  }
  return extensions;
}

/** Block Enter / Shift-Enter so captions cannot become multi-paragraph. */
export const CaptionSingleLine = Extension.create({
  name: "captionSingleLine",

  addKeyboardShortcuts() {
    return {
      Enter: () => true,
      "Shift-Enter": () => true,
      "Mod-Enter": () => true,
    };
  },
});

let captionManager: MarkdownManager | null = null;
let captionHtmlExtensions: AnyExtension[] | null = null;

function getCaptionHtmlPipeline(): {
  manager: MarkdownManager;
  extensions: AnyExtension[];
} {
  if (!captionManager || !captionHtmlExtensions) {
    captionHtmlExtensions = createCaptionExtensions();
    captionManager = new MarkdownManager({ extensions: captionHtmlExtensions });
  }
  return { manager: captionManager, extensions: captionHtmlExtensions };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Keep only phrasing safe for figcaptions: text, strong/b, em/i, a[href]. */
function sanitizeCaptionHtml(rawHtml: string): string {
  if (!rawHtml.trim()) return "";
  if (typeof DOMParser === "undefined") {
    return escapeHtml(rawHtml.replace(/<[^>]+>/g, ""));
  }

  const doc = new DOMParser().parseFromString(
    `<div id="root">${rawHtml}</div>`,
    "text/html"
  );
  const root = doc.getElementById("root");
  if (!root) return "";

  function walk(nodes: Iterable<ChildNode>): string {
    let out = "";
    for (const node of nodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        out += escapeHtml(node.textContent ?? "");
        continue;
      }
      if (!(node instanceof HTMLElement)) continue;
      const tag = node.tagName.toLowerCase();
      if (tag === "p" || tag === "div" || tag === "span") {
        out += walk(node.childNodes);
        continue;
      }
      if (tag === "strong" || tag === "b") {
        const inner = walk(node.childNodes);
        if (inner) out += `<strong>${inner}</strong>`;
        continue;
      }
      if (tag === "em" || tag === "i") {
        const inner = walk(node.childNodes);
        if (inner) out += `<em>${inner}</em>`;
        continue;
      }
      if (tag === "a") {
        const href = (node.getAttribute("href") || "").trim();
        const inner = walk(node.childNodes);
        if (!inner) continue;
        if (/^https?:\/\//i.test(href) || href.startsWith("mailto:")) {
          out += `<a href="${escapeHtml(href)}">${inner}</a>`;
        } else {
          out += inner;
        }
        continue;
      }
      if (tag === "br") continue;
      out += walk(node.childNodes);
    }
    return out;
  }

  return walk(root.childNodes).trim();
}

/**
 * Render caption markdown (bold / italic / link only) to safe figcaption HTML.
 */
export function captionMarkdownToHtml(md: string): string {
  const trimmed = normalizeCaptionMarkdown(md);
  if (!trimmed) return "";
  try {
    const { manager, extensions } = getCaptionHtmlPipeline();
    const doc = manager.parse(trimmed);
    const html = generateHTML(doc, extensions);
    return sanitizeCaptionHtml(html);
  } catch {
    return escapeHtml(trimmed);
  }
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
          const caption = normalizeCaptionMarkdown(
            String(attributes.caption || "")
          );
          return caption ? { "data-caption": caption } : {};
        },
      },
    };
  },

  renderMarkdown(node: JSONContent) {
    const src = String(node.attrs?.src ?? "");
    const alt = String(node.attrs?.alt ?? "");
    const title = String(node.attrs?.title ?? "");
    const caption = normalizeCaptionMarkdown(
      String(node.attrs?.caption ?? "")
    );
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
