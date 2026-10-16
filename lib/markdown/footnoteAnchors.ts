/**
 * Footnotes keyed by what they say instead of their number, for merging.
 *
 * Numbers are assigned by first appearance, so adding one footnote renumbers
 * every later reference and definition. A line merge of two versions numbered
 * differently can then pair a paragraph from one side with the other side's
 * definitions, and the paragraph silently cites the wrong note.
 *
 * `anchorFootnotes` writes each reference as `[^=<encoded note text>]` and
 * drops the numbered definitions, so a note travels with the paragraph that
 * cites it and a renumber is no change at all. `releaseFootnotes` numbers
 * the merged text again by first appearance (as BlogIDE saves it) and
 * re-emits the definitions where the first one stood.
 */

import {
  decodeFootnoteValue,
  encodeFootnoteValue,
} from "@/lib/editor/footnote";
import {
  collectFootnoteDefinitions,
  formatFootnoteDefinition,
} from "@/lib/markdown/pipeline";

const REFERENCE_RE = /\[\^([^\]\r\n]+)\]/g;
const ANCHOR_RE = /\[\^=([A-Za-z0-9._~-]*)\]/g;
/** Where the definitions stood; one line so it merges like any other. */
const DEFINITIONS_LINE = "[[blogide-footnote-definitions]]";

export function anchorFootnotes(markdown: string): string {
  const { bodyLines, definitions } = collectFootnoteDefinitions(markdown);
  if (definitions.size === 0) return markdown;

  // The first definition's line becomes the marker. Every line above it is
  // body, so its index is the same in `bodyLines`.
  const markerAt = Math.min(...[...definitions.values()].map((d) => d.order));

  const referenced = new Set<string>();
  const anchor = (line: string) =>
    line.replace(REFERENCE_RE, (raw, label: string) => {
      const definition = definitions.get(label);
      if (!definition) return raw;
      referenced.add(label);
      return `[^=${encodeFootnoteValue(definition.content)}]`;
    });
  const anchored = bodyLines.map(anchor);

  // Unreferenced definitions stay as written, after the numbered ones.
  const orphans = [...definitions.entries()]
    .filter(([label]) => !referenced.has(label))
    .sort((a, b) => a[1].order - b[1].order)
    .map(([, definition]) => definition.raw);
  anchored.splice(markerAt, 0, DEFINITIONS_LINE, ...orphans);
  return anchored.join("\n");
}

export function releaseFootnotes(text: string): string {
  if (!text.includes(DEFINITIONS_LINE) && !ANCHOR_RE.test(text)) return text;
  ANCHOR_RE.lastIndex = 0;

  // One number per reference, as the editor saves them.
  const definitions: string[] = [];
  const numbered = text.replace(ANCHOR_RE, (_raw, encoded: string) => {
    const number = definitions.length + 1;
    definitions.push(
      formatFootnoteDefinition(number, decodeFootnoteValue(encoded))
    );
    return `[^${number}]`;
  });

  const lines = numbered.split("\n");
  const at = lines.indexOf(DEFINITIONS_LINE);
  const body = lines.filter((line) => line !== DEFINITIONS_LINE);
  if (definitions.length === 0) return body.join("\n");
  if (at >= 0) {
    body.splice(at, 0, ...definitions);
    return body.join("\n");
  }
  // Both sides dropped the marker (e.g. "Take GitHub" on the footer).
  return `${body.join("\n").trimEnd()}\n\n${definitions.join("\n")}\n`;
}

/** Anchored text for people: `[^note: …]` instead of the encoded token. */
export function describeAnchoredFootnotes(text: string, max = 60): string {
  return text
    .split("\n")
    .filter((line) => line !== DEFINITIONS_LINE)
    .join("\n")
    .replace(ANCHOR_RE, (_raw, encoded: string) => {
      const note = decodeFootnoteValue(encoded).replace(/\s+/g, " ").trim();
      return `[^note: ${note.length > max ? `${note.slice(0, max - 1)}…` : note}]`;
    });
}
