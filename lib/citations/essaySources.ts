import type { JSONContent } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { CiteStyleId } from "@/lib/citations/citeStyle";
import { formattedKeyForStyle } from "@/lib/citations/citeStyle";
import {
  citationMatchesText,
  formattedStrings,
  type EssayCitation,
} from "@/lib/markdown/essayCitations";

export type FootnoteMark = {
  id: string;
  content: string;
  pos: number;
  number: number;
};

export type UsedEssaySource = {
  citation: EssayCitation;
  footnote: FootnoteMark | null;
  edited: boolean;
};

function collectFromPm(doc: ProseMirrorNode): FootnoteMark[] {
  const found: FootnoteMark[] = [];
  let number = 0;
  doc.descendants((node, pos) => {
    if (node.type.name !== "footnoteRef") return true;
    number += 1;
    found.push({
      id: String(node.attrs.id ?? ""),
      content: String(node.attrs.content ?? ""),
      pos,
      number,
    });
    return true;
  });
  return found;
}

function collectFromJson(doc: JSONContent): FootnoteMark[] {
  const found: FootnoteMark[] = [];
  let number = 0;
  let pos = 0;
  function visit(node: JSONContent) {
    if (node.type === "footnoteRef") {
      number += 1;
      found.push({
        id: String(node.attrs?.id ?? ""),
        content: String(node.attrs?.content ?? ""),
        pos,
        number,
      });
    }
    node.content?.forEach(visit);
    pos += 1;
  }
  visit(doc);
  return found;
}

export function collectFootnoteMarks(
  doc: ProseMirrorNode | JSONContent
): FootnoteMark[] {
  if (doc && typeof doc === "object" && "descendants" in doc) {
    return collectFromPm(doc as ProseMirrorNode);
  }
  return collectFromJson(doc as JSONContent);
}

function preferredFormatted(
  citation: EssayCitation,
  style: CiteStyleId
): string {
  const key = formattedKeyForStyle(style);
  return (
    citation.formatted[key] ||
    citation.formatted["chicago-note"] ||
    citation.formatted.mla ||
    citation.formatted["chicago-bib"] ||
    ""
  );
}

function findMarkForCitation(
  citation: EssayCitation,
  marks: FootnoteMark[]
): FootnoteMark | undefined {
  if (citation.footnoteIds?.length) {
    const byId = marks.find((mark) => citation.footnoteIds!.includes(mark.id));
    if (byId) return byId;
  }
  return marks.find((mark) => citationMatchesText(citation, mark.content));
}

function collectSearchableText(doc: ProseMirrorNode | JSONContent): string {
  const parts: string[] = [];
  if (doc && typeof doc === "object" && "descendants" in doc) {
    (doc as ProseMirrorNode).descendants((node) => {
      if (node.type.name === "footnoteRef") {
        parts.push(String(node.attrs.content ?? ""));
        return true;
      }
      if (node.isText && node.text) parts.push(node.text);
      return true;
    });
    return parts.join("\n");
  }
  function visit(node: JSONContent) {
    if (node.type === "footnoteRef") {
      parts.push(String(node.attrs?.content ?? ""));
    }
    if (node.type === "text" && typeof node.text === "string") {
      parts.push(node.text);
    }
    node.content?.forEach(visit);
  }
  visit(doc as JSONContent);
  return parts.join("\n");
}

function formattedStillInDoc(
  citation: EssayCitation,
  docText: string
): boolean {
  return formattedStrings(citation).some((value) => {
    const needle = value.trim();
    return needle.length > 0 && docText.includes(needle);
  });
}

export function citationStillInEssay(
  citation: EssayCitation,
  doc: ProseMirrorNode | JSONContent,
  marks = collectFootnoteMarks(doc),
  docText = collectSearchableText(doc)
): boolean {
  if (findMarkForCitation(citation, marks)) return true;
  return formattedStillInDoc(citation, docText);
}

export function citationsSnapshotEqual(
  left: EssayCitation[],
  right: EssayCitation[]
): boolean {
  if (left.length !== right.length) return false;
  return left.every((entry, index) => {
    const other = right[index];
    if (!other || entry.id !== other.id) return false;
    const a = entry.footnoteIds ?? [];
    const b = other.footnoteIds ?? [];
    return a.length === b.length && a.every((id, i) => id === b[i]);
  });
}

/**
 * Drop trailer entries whose footnote was deleted and whose formatted
 * string is no longer in the essay (caret inserts stay while the text does).
 */
export function pruneEssayCitations(
  citations: EssayCitation[],
  doc: ProseMirrorNode | JSONContent
): EssayCitation[] {
  const marks = collectFootnoteMarks(doc);
  const docText = collectSearchableText(doc);
  const livingIds = new Set(marks.map((mark) => mark.id));
  return citations
    .map((citation) => {
      const footnoteIds = (citation.footnoteIds ?? []).filter((id) =>
        livingIds.has(id)
      );
      return {
        ...citation,
        footnoteIds: footnoteIds.length ? footnoteIds : undefined,
      };
    })
    .filter((citation) =>
      citationStillInEssay(citation, doc, marks, docText)
    );
}

/**
 * Sources still present in this essay: living footnotes (by id or matching
 * note text), then caret-only inserts whose formatted string is still here.
 * Deleted footnotes drop off.
 */
export function listUsedEssaySources(
  citations: EssayCitation[],
  doc: ProseMirrorNode | JSONContent,
  style: CiteStyleId
): UsedEssaySource[] {
  const marks = collectFootnoteMarks(doc);
  const docText = collectSearchableText(doc);
  const claimed = new Set<string>();
  const listed = new Set<string>();
  const rows: UsedEssaySource[] = [];

  for (const citation of citations) {
    const footnote = findMarkForCitation(citation, marks) ?? null;
    if (!footnote && !formattedStillInDoc(citation, docText)) continue;
    if (footnote) claimed.add(footnote.id);
    listed.add(citation.id);
    const expected = preferredFormatted(citation, style);
    const edited = Boolean(
      footnote && expected && footnote.content.trim() !== expected.trim()
    );
    rows.push({ citation, footnote, edited });
  }

  for (const mark of marks) {
    if (claimed.has(mark.id)) continue;
    const citation = citations.find((entry) =>
      citationMatchesText(entry, mark.content)
    );
    if (!citation || listed.has(citation.id)) continue;
    listed.add(citation.id);
    rows.push({
      citation,
      footnote: mark,
      edited: false,
    });
  }

  return rows.sort((a, b) => {
    const aNum = a.footnote?.number ?? Number.MAX_SAFE_INTEGER;
    const bNum = b.footnote?.number ?? Number.MAX_SAFE_INTEGER;
    if (aNum !== bNum) return aNum - bNum;
    return a.citation.title.localeCompare(b.citation.title);
  });
}

export function worksCitedBlock(
  rows: UsedEssaySource[],
  style: CiteStyleId
): string {
  return rows
    .map((row) => preferredFormatted(row.citation, style))
    .filter(Boolean)
    .join("\n\n");
}

export function displayFormatted(
  citation: EssayCitation,
  style: CiteStyleId
): string {
  return preferredFormatted(citation, style) || formattedStrings(citation)[0] || "";
}
