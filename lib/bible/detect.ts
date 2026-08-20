import {
  book_names_english,
  detect_references,
  english_abbrev_exclude,
  english_abbrev_include,
  type PassageReferenceMatch,
} from "@gracious.tech/bible-references";

const ENGLISH_BOOK_NAMES: [string, string][] = [
  ...Object.entries(book_names_english),
  ...english_abbrev_include,
];

const ENGLISH_EXCLUDE = [...english_abbrev_exclude];

/**
 * Detect English Bible references in a string (John 3:16, Matt. 10:8, Jn 3:16).
 * Same English name/abbrev tables the fetch(bible) enhancer uses.
 * Synchronous and offline — no CDN request.
 */
export function detectEnglishBibleRefs(
  text: string
): PassageReferenceMatch[] {
  if (!text) return [];
  return [
    ...detect_references(
      text,
      ENGLISH_BOOK_NAMES,
      ENGLISH_EXCLUDE,
      2,
      true
    ),
  ];
}

export function bibleSearchQuery(match: PassageReferenceMatch): string {
  return match.ref.book + match.ref.get_verses_string();
}
