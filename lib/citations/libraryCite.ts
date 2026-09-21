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
import type { LinkPreview } from "@/lib/preview/client";
import { resolvePageSource } from "@/lib/citations/urlSource";
import { loadZoteroConfig } from "@/lib/zotero/token";

/** Chicago-ish note from a saved Library PDF, bookmark, or BibTeX entry. */
export function formatLibraryCitation(
  entry: LibraryMeta,
  style: CiteStyleId = libraryCiteStyle()
): string {
  if (entry.bibtex && entry.kind !== "pdf") {
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
  if (entry.bibtex && entry.kind !== "pdf") {
    const parsed = hitsFromBibtex(entry.bibtex, style)[0];
    if (parsed && entry.kind === "bibtex") {
      return {
        ...parsed,
        id: `library:${entry.id}`,
        url: entry.url ?? parsed.url,
        libraryId: entry.id,
      };
    }
    if (parsed) {
      return {
        ...parsed,
        id: `library:${entry.id}`,
        provider: "library",
        itemType: "link",
        title: entry.name || parsed.title,
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
export async function citeLinkedUrl(
  url: string,
  title?: string,
  preview?: LinkPreview | null
): Promise<void> {
  let entry = findLibraryLinkByUrl(url);
  if (!entry?.bibtex) {
    try {
      const source = await resolvePageSource({ url, title, preview });
      entry = addLibraryLink({
        url,
        title: source.title || title,
        bibtex: source.bibtex,
        citeKey: source.citeKey,
      });
      void addLibraryLinkDurable({
        url,
        title: entry.name,
        bibtex: source.bibtex,
        citeKey: source.citeKey,
      });
    } catch {
      if (!entry) {
        entry = addLibraryLink({ url, title });
        void addLibraryLinkDurable({ url, title });
      }
    }
  }
  const editor = getEssayEditor();
  if (!editor || !entry) {
    requestOpenLibraryCite();
    return;
  }
  insertLibraryCitation(editor, entry);
}

/** Bookmark a URL, filling authors, date, and site from the page when we can. */
export async function saveEnrichedLibraryLink(input: {
  url: string;
  title?: string;
  preview?: LinkPreview | null;
}): Promise<void> {
  const existing = findLibraryLinkByUrl(input.url);
  if (existing) return;
  try {
    const source = await resolvePageSource(input);
    await addLibraryLinkDurable({
      url: input.url,
      title: source.title || input.title,
      bibtex: source.bibtex,
      citeKey: source.citeKey,
    });
  } catch {
    await addLibraryLinkDurable({ url: input.url, title: input.title });
  }
}
