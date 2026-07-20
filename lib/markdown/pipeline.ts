import { MarkdownManager } from "@tiptap/markdown";
import type { JSONContent } from "@tiptap/core";
import { createExtensions } from "@/lib/editor/extensions";
import { prepareImageCaptions } from "@/lib/editor/imageCaption";
import {
  decodeFootnoteValue,
  encodeFootnoteValue,
  type OrphanFootnote,
} from "@/lib/editor/footnote";
import {
  appendDeletedFootnotesTrailer,
  stripDeletedFootnotesTrailer,
  type DeletedFootnote,
} from "@/lib/markdown/deletedFootnotes";
import { splitFrontmatter } from "./frontmatter";

/**
 * Headless markdown pipeline built on the same extension set as the editor
 * (spec §5.1). Frontmatter is split off before parsing and re-attached
 * verbatim on serialization (spec §4.1). Used by the round-trip test suite,
 * the source-view toggle's lossiness check, and later the sync engine.
 */

let manager: MarkdownManager | null = null;

function getManager(): MarkdownManager {
  if (!manager) {
    manager = new MarkdownManager({ extensions: createExtensions() });
  }
  return manager;
}

type PreparedFootnotes = {
  markdown: string;
  orphans: OrphanFootnote[];
};

const FOOTNOTE_DEFINITION_RE = /^\[\^([^\]\r\n]+)\]:[ \t]?(.*)$/;
const FOOTNOTE_REFERENCE_RE = /\[\^([^\]\r\n]+)\]/g;
const FOOTNOTE_SENTINEL_RE =
  /\[\[blogide-fn:([A-Za-z0-9._~-]+):([A-Za-z0-9._~-]*)\]\]/g;
/** GFM continuation: at least four spaces or a tab. */
const FOOTNOTE_CONTINUATION_RE = /^(?: {4}|\t)(.*)$/;

/**
 * True when footnote body needs the indented multi-line definition form
 * (lists, quotes, code fences, multiple paragraphs).
 */
export function footnoteNeedsBlockForm(content: string): boolean {
  const trimmed = content.replace(/\n+$/, "");
  if (!trimmed) return false;
  if (trimmed.includes("\n")) return true;
  return /^(?:[-*+] |\d+\. |> |```|~~~)/.test(trimmed);
}

/** Emit a GFM footnote definition, indenting block content by four spaces. */
export function formatFootnoteDefinition(
  label: string | number,
  content: string
): string {
  const trimmed = content.replace(/\n+$/, "");
  if (!trimmed) return `[^${label}]:`;
  if (!footnoteNeedsBlockForm(trimmed)) {
    return `[^${label}]: ${trimmed}`;
  }
  const indented = trimmed
    .split("\n")
    .map((line) => (line.length === 0 ? "" : `    ${line}`))
    .join("\n");
  return `[^${label}]:\n${indented}`;
}

/**
 * Definitions live outside the ProseMirror document on disk. Before TipTap
 * parses the body, fold referenced definitions into inline atom sentinels and
 * retain unreferenced definitions on the doc attrs for lossless re-emission.
 *
 * Supports GFM multi-line definitions (continuation lines indented ≥4 spaces).
 */
function prepareFootnotes(body: string): PreparedFootnotes {
  const definitions = new Map<
    string,
    { content: string; raw: string; order: number }
  >();
  const bodyLines: string[] = [];
  const lines = body.split("\n");
  let i = 0;

  while (i < lines.length) {
    const line = lines[i]!;
    const match = line.match(FOOTNOTE_DEFINITION_RE);
    if (!match) {
      bodyLines.push(line);
      i += 1;
      continue;
    }

    const label = match[1]!;
    const contentParts: string[] = [];
    if (match[2]) contentParts.push(match[2]);
    const rawLines: string[] = [line];
    const order = i;
    i += 1;

    while (i < lines.length) {
      const next = lines[i]!;
      if (/^[ \t]*$/.test(next)) {
        // Keep blank lines only when an indented continuation follows.
        let j = i + 1;
        while (j < lines.length && /^[ \t]*$/.test(lines[j]!)) j += 1;
        const peek = lines[j];
        if (
          peek &&
          FOOTNOTE_CONTINUATION_RE.test(peek) &&
          !FOOTNOTE_DEFINITION_RE.test(peek)
        ) {
          contentParts.push("");
          rawLines.push(next);
          i += 1;
          continue;
        }
        break;
      }
      const cont = next.match(FOOTNOTE_CONTINUATION_RE);
      if (cont && !FOOTNOTE_DEFINITION_RE.test(next)) {
        contentParts.push(cont[1] ?? "");
        rawLines.push(next);
        i += 1;
        continue;
      }
      break;
    }

    definitions.set(label, {
      content: contentParts.join("\n").replace(/^\n+/, "").replace(/\n+$/, ""),
      raw: rawLines.join("\n"),
      order,
    });
  }

  const referencedLabels = new Set<string>();
  let occurrence = 0;
  const markdown = bodyLines
    .join("\n")
    .replace(FOOTNOTE_REFERENCE_RE, (_raw, label: string) => {
      referencedLabels.add(label);
      occurrence += 1;
      const content = definitions.get(label)?.content ?? "";
      const id = `source-${encodeFootnoteValue(label)}-${occurrence}`;
      return `[[blogide-fn:${encodeFootnoteValue(id)}:${encodeFootnoteValue(content)}]]`;
    })
    .replace(/\n+$/, "\n");

  const orphans = [...definitions.entries()]
    .filter(([label]) => !referencedLabels.has(label))
    .sort((a, b) => a[1].order - b[1].order)
    .map(([label, definition]) => ({ label, raw: definition.raw }));

  return { markdown, orphans };
}

/** Parse a markdown body (frontmatter already removed) into TipTap JSON. */
export function parseBody(body: string): JSONContent {
  const { body: withoutTrailer, deleted } = stripDeletedFootnotesTrailer(body);
  const prepared = prepareFootnotes(withoutTrailer);
  const withCaptions = prepareImageCaptions(prepared.markdown);
  const doc = getManager().parse(withCaptions);
  doc.attrs = {
    ...doc.attrs,
    orphanFootnotes: prepared.orphans,
    deletedFootnotes: deleted,
  };
  return doc;
}

/** Serialize TipTap JSON back to a markdown body. */
export function serializeBody(doc: JSONContent): string {
  const serialized = getManager().serialize(doc);
  const definitions: string[] = [];
  let number = 0;

  const body = serialized.replace(
    FOOTNOTE_SENTINEL_RE,
    (_raw, _encodedId: string, encodedContent: string) => {
      number += 1;
      const content = decodeFootnoteValue(encodedContent);
      definitions.push(formatFootnoteDefinition(number, content));
      return `[^${number}]`;
    }
  );

  const orphans = Array.isArray(doc.attrs?.orphanFootnotes)
    ? (doc.attrs.orphanFootnotes as OrphanFootnote[])
    : [];
  const footer = [...definitions, ...orphans.map((orphan) => orphan.raw)];
  const withFooter =
    footer.length === 0
      ? body
      : `${body.trimEnd()}\n\n${footer.join("\n")}`;

  const deleted = Array.isArray(doc.attrs?.deletedFootnotes)
    ? (doc.attrs.deletedFootnotes as DeletedFootnote[])
    : [];

  return appendDeletedFootnotesTrailer(withFooter, deleted);
}

/**
 * Canonicalize: exactly one trailing newline. Trailing spaces inside lines
 * are left alone — hard breaks are serialized as two trailing spaces.
 */
export function normalize(markdown: string): string {
  return markdown.replace(/\n*$/, "\n");
}

/**
 * Full-document round trip: split frontmatter, parse body, serialize,
 * re-attach frontmatter. `serializeToMarkdown(parseFromMarkdown(md)) === md`
 * must hold for all supported constructs (spec principle #3).
 */
export function roundTrip(markdown: string): string {
  const { frontmatter, body } = splitFrontmatter(markdown);
  return frontmatter + normalize(serializeBody(parseBody(body)));
}

/**
 * True when re-parsing this markdown through the editor schema would not
 * reproduce it — used to warn before switching out of source view (spec §5.1).
 */
export function isLossy(markdown: string): boolean {
  return normalize(roundTrip(markdown)) !== normalize(markdown);
}

/** What the editor would emit after a source → rich-text round trip. */
export function previewRoundTrip(markdown: string): string {
  return normalize(roundTrip(markdown));
}
