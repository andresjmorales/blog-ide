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
  type CiteHit,
} from "@/lib/citations/localHits";
import { insertCitationFootnote } from "@/lib/citations/insertCitation";
import {
  DEFAULT_CITE_STYLE,
  type CiteStyleId,
} from "@/lib/citations/citeStyle";
import { loadZoteroConfig } from "@/lib/zotero/token";

/** Chicago-ish note from a saved Library PDF or bookmark. */
export function formatLibraryCitation(entry: LibraryMeta): string {
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

export function hitFromLibraryEntry(entry: LibraryMeta): CiteHit {
  const formatted = formatLibraryCitation(entry);
  return {
    id: `library:${entry.id}`,
    provider: "library",
    citeKey: entry.id.slice(0, 12),
    title: entry.name,
    creators: "",
    year: "",
    itemType: entry.kind,
    formatted,
    bibtex: "",
    url: entry.url,
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
  const hit = hitFromLibraryEntry(entry);
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
