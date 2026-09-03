import type { CitationStyle } from "@/lib/citations/formatBibtex";

/** Cite-rail styles. Chicago note is the essay default (Zotero API default). */
export type CiteStyleId =
  | "chicago-note-bibliography"
  | "chicago-author-date"
  | "modern-language-association";

export const DEFAULT_CITE_STYLE: CiteStyleId = "chicago-note-bibliography";

export const CITE_STYLE_LABELS: Record<CiteStyleId, string> = {
  "chicago-note-bibliography": "Chicago note",
  "chicago-author-date": "Chicago bibliography",
  "modern-language-association": "MLA",
};

export function isCiteStyleId(value: unknown): value is CiteStyleId {
  return (
    value === "chicago-note-bibliography" ||
    value === "chicago-author-date" ||
    value === "modern-language-association"
  );
}

/** Local BibTeX helper: Chicago note/bib share the same thin formatter. */
export function citeStyleToBibtex(style: CiteStyleId): CitationStyle {
  return style === "modern-language-association" ? "mla" : "chicago";
}

export function citeStyleFromDashPref(
  dashStyle: "chicago" | "mla" | undefined
): CiteStyleId {
  return dashStyle === "mla"
    ? "modern-language-association"
    : DEFAULT_CITE_STYLE;
}

export function formattedKeyForStyle(
  style: CiteStyleId
): "chicago-note" | "chicago-bib" | "mla" {
  if (style === "modern-language-association") return "mla";
  if (style === "chicago-author-date") return "chicago-bib";
  return "chicago-note";
}
