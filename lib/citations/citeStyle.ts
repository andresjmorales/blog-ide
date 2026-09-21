import type { LocalCiteStyle } from "@/lib/citations/formatBibtex";

/** Citation styles. Chicago note is the essay default (Zotero CSL id). */
export type CiteStyleId =
  | "chicago-note-bibliography"
  | "turabian-fullnote-bibliography"
  | "chicago-author-date"
  | "modern-language-association"
  | "apa"
  | "harvard-cite-them-right"
  | "ieee"
  | "vancouver";

export const DEFAULT_CITE_STYLE: CiteStyleId = "chicago-note-bibliography";

export const CITE_STYLE_LABELS: Record<CiteStyleId, string> = {
  "chicago-note-bibliography": "Chicago note",
  "turabian-fullnote-bibliography": "Turabian note",
  "chicago-author-date": "Chicago author-date",
  "modern-language-association": "MLA",
  apa: "APA",
  "harvard-cite-them-right": "Harvard",
  ieee: "IEEE",
  vancouver: "Vancouver",
};

const CITE_STYLE_IDS = Object.keys(CITE_STYLE_LABELS) as CiteStyleId[];

export type FormattedKey =
  | "chicago-note"
  | "chicago-bib"
  | "turabian"
  | "mla"
  | "apa"
  | "harvard"
  | "ieee"
  | "vancouver";

export const FORMATTED_KEYS: FormattedKey[] = [
  "chicago-note",
  "chicago-bib",
  "turabian",
  "mla",
  "apa",
  "harvard",
  "ieee",
  "vancouver",
];

export function isCiteStyleId(value: unknown): value is CiteStyleId {
  return typeof value === "string" && CITE_STYLE_IDS.includes(value as CiteStyleId);
}

export function isFormattedKey(value: string): value is FormattedKey {
  return (FORMATTED_KEYS as string[]).includes(value);
}

/** Note styles insert a footnote; other styles insert the full reference. */
export function citeStyleKind(
  style: CiteStyleId
): "note" | "author-date" | "numeric" {
  if (
    style === "chicago-note-bibliography" ||
    style === "turabian-fullnote-bibliography"
  ) {
    return "note";
  }
  if (style === "ieee" || style === "vancouver") return "numeric";
  return "author-date";
}

export function citeStyleToLocal(style: CiteStyleId): LocalCiteStyle {
  switch (style) {
    case "chicago-author-date":
      return "chicago-author-date";
    case "turabian-fullnote-bibliography":
      return "turabian";
    case "modern-language-association":
      return "mla";
    case "apa":
      return "apa";
    case "harvard-cite-them-right":
      return "harvard";
    case "ieee":
      return "ieee";
    case "vancouver":
      return "vancouver";
    default:
      return "chicago-note";
  }
}

export function citeStyleFromDashPref(
  dashStyle: "chicago" | "mla" | undefined
): CiteStyleId {
  return dashStyle === "mla"
    ? "modern-language-association"
    : DEFAULT_CITE_STYLE;
}

export function formattedKeyForStyle(style: CiteStyleId): FormattedKey {
  switch (style) {
    case "modern-language-association":
      return "mla";
    case "chicago-author-date":
      return "chicago-bib";
    case "turabian-fullnote-bibliography":
      return "turabian";
    case "apa":
      return "apa";
    case "harvard-cite-them-right":
      return "harvard";
    case "ieee":
      return "ieee";
    case "vancouver":
      return "vancouver";
    default:
      return "chicago-note";
  }
}
