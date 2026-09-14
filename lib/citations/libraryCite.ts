import type { Editor } from "@tiptap/core";
import {
  addLibraryLink,
  addLibraryLinkDurable,
  findLibraryLinkByUrl,
  type LibraryMeta,
} from "@/lib/library/sessionLibrary";
import { getEssayEditor } from "@/lib/citations/essayEditor";
import { requestOpenLibraryCite } from "@/lib/citations/openLibraryCite";
import {
  citationFromHit,
  hitsFromBibtex,
  type CiteHit,
} from "@/lib/citations/localHits";
import { insertCitationFootnote } from "@/lib/citations/insertCitation";
import {
  DEFAULT_CITE_STYLE,
  type CiteStyleId,
} from "@/lib/citations/citeStyle";
import { loadZoteroConfig } from "@/lib/zotero/token";

/** Chicago-ish note from a saved Library PDF, bookmark, or BibTeX entry. */
export function formatLibraryCitation(
  entry: LibraryMeta,
  style: CiteStyleId = libraryCiteStyle()
): string {
  if (entry.kind === "bibtex" && entry.bibtex) {
    return (
      hitsFromBibtex(entry.bibtex, style)[0]?.formatted ||
      entry.name.trim() ||
      "Untitled"
    );
  }
  if (entry.kind === "link" && entry.url) {
    const title =
      entry.name && entry.name !== entry.url ? `“${entry.name}”` : "";
    return (
      [title, entry.url].filter(Boolean).join(", ").replace(/\s+,/, ",") +
      (entry.url.endsWith(".") ? "" : ".")
    );
  }
  return entry.name.trim() || "Untitled";
}

export function hitFromLibraryEntry(
  entry: LibraryMeta,
  style: CiteStyleId = libraryCiteStyle()
): CiteHit {
  if (entry.kind === "bibtex" && entry.bibtex) {
    const parsed = hitsFromBibtex(entry.bibtex, style)[0];
    if (parsed) {
      return {
        ...parsed,
        id: `library:${entry.id}`,
        url: entry.url ?? parsed.url,
        libraryId: entry.id,
      };
    }
  }
  const formatted = formatLibraryCitation(entry, style);
  return {
    id: `library:${entry.id}`,
    provider: "library",
    citeKey: entry.citeKey || entry.id.slice(0, 12),
    title: entry.name,
    creators: "",
    year: "",
    itemType: entry.kind,
    formatted,
    bibtex: entry.bibtex ?? "",
    url: entry.url,
    libraryId: entry.id,
  };
}

export function libraryCiteStyle(): CiteStyleId {
  return loadZoteroConfig().style || DEFAULT_CITE_STYLE;
}

/** Insert a Library PDF or bookmark as a footnote on the open essay. */
export function insertLibraryCitation(
  editor: Editor,
  entry: LibraryMeta,
  style: CiteStyleId = libraryCiteStyle()
): void {
  const hit = hitFromLibraryEntry(entry, style);
  if (!hit.formatted) return;
  insertCitationFootnote(editor, citationFromHit(hit, style), hit.formatted);
}

/**
 * Bookmark a URL if needed, then insert a footnote. Opens Library when no
 * essay editor is mounted (phone sheet / empty workspace).
 */
export function citeLinkedUrl(url: string, title?: string): void {
  const existing = findLibraryLinkByUrl(url);
  const entry = existing ?? addLibraryLink({ url, title });
  if (!existing) void addLibraryLinkDurable({ url, title });
  const editor = getEssayEditor();
  if (!editor) {
    requestOpenLibraryCite();
    return;
  }
  insertLibraryCitation(editor, entry);
}
