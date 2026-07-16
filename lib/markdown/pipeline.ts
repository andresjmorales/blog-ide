import { MarkdownManager } from "@tiptap/markdown";
import type { JSONContent } from "@tiptap/core";
import { createExtensions } from "@/lib/editor/extensions";
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

/**
 * Definitions live outside the ProseMirror document on disk. Before TipTap
 * parses the body, fold referenced definitions into inline atom sentinels and
 * retain unreferenced definitions on the doc attrs for lossless re-emission.
 */
function prepareFootnotes(body: string): PreparedFootnotes {
  const definitions = new Map<
    string,
    { content: string; raw: string; order: number }
  >();
  const bodyLines: string[] = [];

  body.split("\n").forEach((line, order) => {
    const match = line.match(FOOTNOTE_DEFINITION_RE);
    if (match) {
      definitions.set(match[1], {
        content: match[2],
        raw: line,
        order,
      });
    } else {
      bodyLines.push(line);
    }
  });

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
  const doc = getManager().parse(prepared.markdown);
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
      definitions.push(`[^${number}]:${content ? ` ${content}` : ""}`);
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
  const { body } = splitFrontmatter(markdown);
  return normalize(serializeBody(parseBody(body))) !== normalize(body);
}
