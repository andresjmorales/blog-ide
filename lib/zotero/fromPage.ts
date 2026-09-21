/**
 * Map scraped page metadata onto a Zotero Web API item. Only fields that
 * exist for the chosen item type are sent; Zotero rejects unknown fields.
 */

import type { PageCitation, PageCreator } from "@/lib/preview/pageCitation";

const FIELDS: Record<string, string[]> = {
  webpage: ["title", "abstractNote", "websiteTitle", "date", "url", "accessDate", "language"],
  journalArticle: [
    "title",
    "abstractNote",
    "publicationTitle",
    "volume",
    "issue",
    "pages",
    "date",
    "DOI",
    "ISSN",
    "url",
    "accessDate",
    "language",
  ],
  newspaperArticle: [
    "title",
    "abstractNote",
    "publicationTitle",
    "pages",
    "date",
    "ISSN",
    "url",
    "accessDate",
    "language",
  ],
  magazineArticle: [
    "title",
    "abstractNote",
    "publicationTitle",
    "volume",
    "issue",
    "pages",
    "date",
    "ISSN",
    "url",
    "accessDate",
    "language",
  ],
  blogPost: ["title", "abstractNote", "blogTitle", "date", "url", "accessDate", "language"],
  book: [
    "title",
    "abstractNote",
    "publisher",
    "date",
    "ISBN",
    "url",
    "accessDate",
    "language",
  ],
};

export function zoteroItemFromPage(
  citation: PageCitation,
  input: { url: string; title?: string; accessDate?: string }
): Record<string, unknown> {
  const itemType =
    citation.itemType === "webpage" && citation.doi
      ? "journalArticle"
      : FIELDS[citation.itemType]
        ? citation.itemType
        : "webpage";
  const title = pickTitle(citation.title, input.title, input.url);
  const site = citation.websiteTitle || citation.publicationTitle || "";
  const values: Record<string, string> = {
    title,
    url: input.url.trim() || citation.url,
    accessDate: input.accessDate || new Date().toISOString().slice(0, 10),
  };
  if (citation.abstract) values.abstractNote = citation.abstract;
  if (citation.date) values.date = citation.date;
  if (citation.language) values.language = citation.language;
  if (citation.doi) values.DOI = citation.doi;
  if (citation.issn) values.ISSN = citation.issn;
  if (citation.isbn) values.ISBN = citation.isbn;
  if (citation.volume) values.volume = citation.volume;
  if (citation.issue) values.issue = citation.issue;
  if (citation.pages) values.pages = citation.pages;
  if (citation.publisher && itemType === "book") values.publisher = citation.publisher;
  if (citation.publicationTitle && itemType !== "webpage" && itemType !== "blogPost") {
    values.publicationTitle = citation.publicationTitle;
  }
  if (itemType === "webpage" && site) values.websiteTitle = site;
  if (itemType === "blogPost" && site) values.blogTitle = site;

  const allowed = new Set(FIELDS[itemType]);
  const item: Record<string, unknown> = { itemType };
  for (const [key, value] of Object.entries(values)) {
    if (!allowed.has(key) || !value.trim()) continue;
    item[key] = value.trim();
  }
  const creators = zoteroCreators(citation.creators);
  if (creators.length) item.creators = creators;
  return item;
}

function pickTitle(scraped: string, fallback: string | undefined, url: string): string {
  const scrapedTitle = scraped.trim();
  const given = fallback?.trim() || "";
  if (scrapedTitle && scrapedTitle !== url) return scrapedTitle;
  if (given && given !== url) return given;
  return scrapedTitle || given || url;
}

function zoteroCreators(creators: PageCreator[]): Array<Record<string, string>> {
  const out: Array<Record<string, string>> = [];
  for (const creator of creators) {
    if (creator.name && !creator.lastName && !creator.firstName) {
      out.push({ creatorType: "author", name: creator.name });
      continue;
    }
    const lastName = creator.lastName?.trim() || "";
    const firstName = creator.firstName?.trim() || "";
    if (!lastName && !firstName) continue;
    const row: Record<string, string> = { creatorType: "author" };
    if (firstName) row.firstName = firstName;
    if (lastName) row.lastName = lastName;
    out.push(row);
  }
  return out;
}
