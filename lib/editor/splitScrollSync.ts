/**
 * Split view scroll sync. The preview is a TipTap render with no source map,
 * so preview blocks are paired with source lines by their leading text, then
 * scroll positions are interpolated between the paired anchors.
 */

/** A point that shows the same passage in both panes (content-space px). */
export type ScrollAnchor = { source: number; preview: number };

/** Letters and digits only, lowercased: survives markdown syntax + smart quotes. */
export function anchorText(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

/** How much of a block's leading text identifies it. */
export const ANCHOR_KEY_CHARS = 12;
/** Shorter keys ("OK", "1.") match too many lines to trust. */
const MIN_KEY_CHARS = 3;
/** A soft-wrapped first line shorter than this can't vouch for a block. */
const MIN_PARTIAL_LINE_CHARS = 6;
/** How far past the last anchor to look before giving up on a block. */
const SEARCH_WINDOW_LINES = 400;

/**
 * A source line reduced to what the preview shows: link targets, images,
 * footnote refs, inline math, and HTML tags drop out before normalizing.
 */
export function sourceLineKey(line: string): string {
  return anchorText(
    line
      .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
      .replace(/\[\^[^\]]+\]/g, "")
      .replace(/\]\([^)]*\)/g, "]")
      .replace(/\$\$?[^$]*\$\$?/g, "")
      .replace(/<[^>]+>/g, "")
  );
}

export function blockKey(previewText: string): string | null {
  const key = anchorText(previewText).slice(0, ANCHOR_KEY_CHARS);
  return key.length >= MIN_KEY_CHARS ? key : null;
}

/**
 * Pair each preview block key with the source line it starts on, scanning
 * forward only so anchors stay in document order. Unmatched blocks get null
 * and are interpolated over.
 */
export function matchBlocksToLines(
  keys: (string | null)[],
  lines: string[],
  startLine = 0
): (number | null)[] {
  const lineKeys: (string | undefined)[] = new Array(lines.length);
  const keyFor = (index: number) =>
    (lineKeys[index] ??= sourceLineKey(lines[index] ?? ""));
  let cursor = startLine;
  return keys.map((key) => {
    if (!key) return null;
    const end = Math.min(lines.length, cursor + SEARCH_WINDOW_LINES);
    for (let i = cursor; i < end; i += 1) {
      const lineKey = keyFor(i);
      if (!lineKey) continue;
      if (
        lineKey.startsWith(key) ||
        (lineKey.length >= MIN_PARTIAL_LINE_CHARS && key.startsWith(lineKey))
      ) {
        cursor = i + 1;
        return i;
      }
    }
    return null;
  });
}

/**
 * Keep anchors strictly increasing on both axes (a mis-pair that goes
 * backwards would make scrolling jump), then add the document ends.
 */
export function normalizeAnchors(
  anchors: ScrollAnchor[],
  sourceEnd: number,
  previewEnd: number
): ScrollAnchor[] {
  const sorted = [...anchors].sort((a, b) => a.source - b.source);
  const out: ScrollAnchor[] = [{ source: 0, preview: 0 }];
  for (const anchor of sorted) {
    const last = out[out.length - 1]!;
    if (anchor.source <= last.source || anchor.preview <= last.preview) {
      continue;
    }
    if (anchor.source >= sourceEnd || anchor.preview >= previewEnd) continue;
    out.push(anchor);
  }
  out.push({
    source: Math.max(sourceEnd, out[out.length - 1]!.source + 1),
    preview: Math.max(previewEnd, out[out.length - 1]!.preview + 1),
  });
  return out;
}

/** Atoms whose rendered text (KaTeX, footnote numbers, captions) isn't in the source line. */
const SKIP_TEXT_SELECTOR =
  "[contenteditable='false'], .katex, [data-inline-math], [data-block-math], .react-renderer";

/** Leading visible text of a preview block, skipping atom node views. */
export function previewBlockText(el: Element, maxChars = 64): string {
  let out = "";
  const walk = (node: Node): boolean => {
    if (node.nodeType === 3) {
      out += node.nodeValue ?? "";
      return anchorText(out).length >= maxChars;
    }
    if (!(node instanceof Element)) return false;
    if (node !== el && node.matches(SKIP_TEXT_SELECTOR)) return false;
    for (const child of Array.from(node.childNodes)) {
      if (walk(child)) return true;
    }
    return false;
  };
  walk(el);
  return out;
}

/**
 * Blocks worth anchoring: top-level nodes, with list items and quote
 * children split out so long lists don't scroll as one lump.
 */
export function previewBlocks(root: Element): Element[] {
  const blocks: Element[] = [];
  for (const child of Array.from(root.children)) {
    if (child.matches("ul, ol")) {
      blocks.push(...Array.from(child.children).filter((c) => c.matches("li")));
    } else if (child.matches("blockquote")) {
      blocks.push(...Array.from(child.children));
    } else {
      blocks.push(child);
    }
  }
  return blocks;
}

/** Map a position in one pane to the other by linear interpolation. */
export function mapScroll(
  anchors: ScrollAnchor[],
  value: number,
  from: keyof ScrollAnchor
): number {
  const to: keyof ScrollAnchor = from === "source" ? "preview" : "source";
  if (anchors.length === 0) return value;
  if (value <= anchors[0]![from]) return anchors[0]![to];
  for (let i = 1; i < anchors.length; i += 1) {
    const b = anchors[i]!;
    if (value > b[from]) continue;
    const a = anchors[i - 1]!;
    const span = b[from] - a[from];
    const t = span > 0 ? (value - a[from]) / span : 0;
    return a[to] + t * (b[to] - a[to]);
  }
  return anchors[anchors.length - 1]![to];
}
