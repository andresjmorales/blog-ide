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

/**
 * Sources this essay already used: the citations trailer plus footnotes
 * whose body still matches a stored formatted string. Ordered by first
 * footnote number, then trailer order for caret-only inserts.
 */
export function listUsedEssaySources(
  citations: EssayCitation[],
  doc: ProseMirrorNode | JSONContent,
  style: CiteStyleId
): UsedEssaySource[] {
  const marks = collectFootnoteMarks(doc);
  const claimed = new Set<string>();
  const listed = new Set<string>();
  const rows: UsedEssaySource[] = [];

  for (const citation of citations) {
    const footnote = findMarkForCitation(citation, marks) ?? null;
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
