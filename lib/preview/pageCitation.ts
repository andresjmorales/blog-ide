/**
 * Page metadata a Zotero translator would usually keep: Highwire citation_*
 * tags, Dublin Core, JSON-LD, and Open Graph. Enough to build a Zotero item
 * and a local footnote. Not a site-specific translator.
 */

import { parseBibtex } from "@/lib/citations/formatBibtex";
import { decodeHtmlEntities } from "@/lib/preview/htmlEntities";

export type PageItemType =
  | "webpage"
  | "journalArticle"
  | "newspaperArticle"
  | "magazineArticle"
  | "blogPost"
  | "book";

export type PageCreator = {
  firstName?: string;
  lastName?: string;
  /** Institutional author (Zotero single-field creator). */
  name?: string;
};

export type PageCitation = {
  itemType: PageItemType;
  title: string;
  creators: PageCreator[];
  /** YYYY-MM-DD or YYYY. */
  date?: string;
  abstract?: string;
  publicationTitle?: string;
  websiteTitle?: string;
  volume?: string;
  issue?: string;
  pages?: string;
  doi?: string;
  issn?: string;
  isbn?: string;
  publisher?: string;
  language?: string;
  url: string;
};

const ARTICLE_TYPES: Record<string, PageItemType> = {
  scholarlyarticle: "journalArticle",
  medicalscholarlyarticle: "journalArticle",
  newsarticle: "newspaperArticle",
  reportagenewsarticle: "newspaperArticle",
  analysisnewsarticle: "newspaperArticle",
  opinionnewsarticle: "newspaperArticle",
  reviewnewsarticle: "newspaperArticle",
  backgroundnewsarticle: "newspaperArticle",
  blogposting: "blogPost",
  liveblogposting: "blogPost",
  book: "book",
  chapter: "book",
};

export function extractPageCitation(
  html: string,
  pageUrl: string,
  hints?: { title?: string; description?: string; siteName?: string; author?: string }
): PageCitation {
  const ld = citationFromJsonLd(html);
  const meta = citationFromMeta(html);
  const doi = meta.doi || ld?.doi || doiFromUrl(pageUrl);
  const title = firstText(
    meta.title,
    ld?.title,
    hints?.title,
    html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]
  );
  const creators =
    meta.creators.length > 0
      ? meta.creators
      : ld?.creators.length
        ? ld.creators
        : parseCreatorList(authorHint(hints?.author));
  const site = firstText(hints?.siteName, ld?.websiteTitle);
  const publication = firstText(meta.publicationTitle, ld?.publicationTitle);
  const itemType = resolveItemType(meta.itemType, ld?.itemType, publication);

  const citation: PageCitation = {
    itemType,
    title: clip(decodeHtmlEntities(title || pageUrl), 500),
    creators,
    url: pageUrl,
  };
  assign(citation, "date", meta.date || ld?.date);
  assign(
    citation,
    "abstract",
    clip(stripTags(meta.abstract || ld?.abstract || hints?.description || ""), 2000)
  );
  assign(citation, "publicationTitle", publication);
  assign(citation, "websiteTitle", site);
  assign(citation, "volume", meta.volume || ld?.volume);
  assign(citation, "issue", meta.issue || ld?.issue);
  assign(citation, "pages", meta.pages || ld?.pages);
  assign(citation, "doi", doi);
  assign(citation, "issn", meta.issn || ld?.issn);
  assign(citation, "isbn", meta.isbn || ld?.isbn);
  assign(citation, "publisher", meta.publisher || ld?.publisher);
  assign(citation, "language", meta.language || ld?.language || htmlLang(html));
  if (itemType === "webpage" || itemType === "blogPost") {
    if (!citation.websiteTitle && citation.publicationTitle) {
      citation.websiteTitle = citation.publicationTitle;
    }
  }
  if (
    (itemType === "newspaperArticle" || itemType === "magazineArticle") &&
    !citation.publicationTitle &&
    citation.websiteTitle
  ) {
    citation.publicationTitle = citation.websiteTitle;
  }
  return citation;
}

export function pageCitationFromBibtex(
  source: string,
  url: string
): PageCitation | undefined {
  const entry = parseBibtex(source)[0];
  if (!entry) return undefined;
  const fields = entry.fields;
  const title = fields.title?.trim();
  if (!title) return undefined;
  const itemType: PageItemType =
    entry.type === "article"
      ? "journalArticle"
      : entry.type === "book" || entry.type === "inbook"
        ? "book"
        : "webpage";
  const citation: PageCitation = {
    itemType,
    title,
    creators: parseCreatorList(fields.author || fields.editor || ""),
    url: fields.url || url,
  };
  assign(citation, "date", normalizeDate(fields.date || fields.year || ""));
  assign(citation, "publicationTitle", fields.journal || fields.booktitle);
  assign(citation, "websiteTitle", fields.howpublished || fields.note);
  assign(citation, "volume", fields.volume);
  assign(citation, "issue", fields.number);
  assign(citation, "pages", fields.pages);
  assign(citation, "doi", cleanDoi(fields.doi || ""));
  assign(citation, "issn", fields.issn);
  assign(citation, "isbn", fields.isbn);
  assign(citation, "publisher", fields.publisher);
  assign(citation, "abstract", fields.abstract);
  assign(citation, "language", fields.language);
  return citation;
}

export function preferPageCitation(
  live: PageCitation | undefined,
  stored: PageCitation | undefined
): PageCitation | undefined {
  if (!live) return stored;
  if (!stored) return live;
  return citationScore(stored) > citationScore(live) ? stored : live;
}

function citationScore(citation: PageCitation): number {
  return [
    citation.creators.length > 0,
    citation.doi,
    citation.publicationTitle,
    citation.date,
    citation.publisher,
    citation.abstract,
    citation.websiteTitle,
    citation.volume,
    citation.pages,
  ].filter(Boolean).length;
}

export function bibtexFromPageCitation(
  citation: PageCitation
): { citeKey: string; bibtex: string } | null {
  const title = citation.title.trim();
  if (!title) return null;
  const citeKey = citeKeyFromPage(citation);
  const fields: Record<string, string> = { title };
  const author = bibtexAuthor(citation.creators);
  if (author) fields.author = author;
  const year = yearOf(citation.date);
  if (year) fields.year = year;
  if (citation.date && citation.date !== year) fields.date = citation.date;
  if (citation.url) fields.url = citation.url;
  if (citation.doi) fields.doi = citation.doi;
  if (citation.abstract) fields.abstract = citation.abstract;
  if (citation.volume) fields.volume = citation.volume;
  if (citation.issue) fields.number = citation.issue;
  if (citation.pages) fields.pages = citation.pages;
  if (citation.issn) fields.issn = citation.issn;
  if (citation.isbn) fields.isbn = citation.isbn;
  if (citation.publisher) fields.publisher = citation.publisher;
  if (citation.language) fields.language = citation.language;

  let type = "misc";
  if (citation.itemType === "journalArticle") {
    type = "article";
    if (citation.publicationTitle) fields.journal = citation.publicationTitle;
  } else if (citation.itemType === "book") {
    type = "book";
  } else {
    const site = citation.publicationTitle || citation.websiteTitle;
    if (site) fields.howpublished = site;
  }

  const body = Object.entries(fields)
    .map(([key, value]) => `  ${key} = {${escapeBibtex(value)}}`)
    .join(",\n");
  return { citeKey, bibtex: `@${type}{${citeKey},\n${body}\n}` };
}

type CrossrefWork = {
  type?: string;
  title?: string[];
  author?: Array<{ given?: string; family?: string; name?: string }>;
  "container-title"?: string[];
  volume?: string;
  issue?: string;
  page?: string;
  issued?: { "date-parts"?: number[][] };
  DOI?: string;
  ISSN?: string[];
  ISBN?: string[];
  publisher?: string;
  abstract?: string;
  language?: string;
};

export function mergeCrossrefWork(
  base: PageCitation,
  work: CrossrefWork | null | undefined
): PageCitation {
  if (!work) return base;
  const next: PageCitation = { ...base, creators: [...base.creators] };
  const crossrefType = crossrefItemType(work.type);
  if (
    crossrefType &&
    (next.itemType === "webpage" || next.itemType === "magazineArticle") &&
    crossrefType !== "webpage"
  ) {
    next.itemType = crossrefType;
  }
  const crossTitle = firstText(work.title?.[0]);
  if (crossTitle && (!next.title || next.title === next.url)) next.title = clip(crossTitle, 500);
  if (next.creators.length === 0 && work.author?.length) {
    next.creators = work.author
      .map((person) => {
        if (person.name && !person.family) return { name: person.name.trim() };
        return {
          firstName: person.given?.trim() || undefined,
          lastName: person.family?.trim() || undefined,
        };
      })
      .filter((person) => person.name || person.lastName || person.firstName);
  }
  assign(next, "publicationTitle", next.publicationTitle || work["container-title"]?.[0]);
  assign(next, "volume", next.volume || work.volume);
  assign(next, "issue", next.issue || work.issue);
  assign(next, "pages", next.pages || work.page);
  assign(next, "doi", next.doi || cleanDoi(work.DOI || ""));
  assign(next, "issn", next.issn || work.ISSN?.[0]);
  assign(next, "isbn", next.isbn || work.ISBN?.[0]);
  assign(next, "publisher", next.publisher || work.publisher);
  assign(next, "language", next.language || work.language);
  assign(next, "abstract", next.abstract || clip(stripTags(work.abstract || ""), 2000));
  assign(next, "date", next.date || dateFromParts(work.issued?.["date-parts"]?.[0]));
  return next;
}

export async function enrichWithCrossref(citation: PageCitation): Promise<PageCitation> {
  const doi = citation.doi;
  if (!doi) return citation;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const response = await fetch(
      `https://api.crossref.org/works/${encodeURIComponent(doi)}`,
      {
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          "User-Agent": "BlogIDE-LinkPreview/1.0 (https://blogide.com)",
        },
      }
    );
    if (!response.ok) return citation;
    const body = (await response.json()) as { message?: CrossrefWork };
    return mergeCrossrefWork(citation, body.message);
  } catch {
    return citation;
  } finally {
    clearTimeout(timer);
  }
}

function citationFromMeta(html: string): Partial<PageCitation> & {
  creators: PageCreator[];
  itemType?: PageItemType;
} {
  const title = firstOf(metaValues(html, ["citation_title", "dc.title"]));
  const creators = parseCreatorList(
    metaValues(html, ["citation_author", "dc.creator", "author"]).join(" and ")
  );
  const journal = firstOf(metaValues(html, ["citation_journal_title"]));
  const book = firstOf(metaValues(html, ["citation_book_title", "citation_conference_title"]));
  const firstPage = firstOf(metaValues(html, ["citation_firstpage"]));
  const lastPage = firstOf(metaValues(html, ["citation_lastpage"]));
  const pages =
    firstOf(metaValues(html, ["citation_pages"])) ||
    (firstPage && lastPage ? `${firstPage}-${lastPage}` : firstPage);
  const date = normalizeDate(
    firstOf(
      metaValues(html, [
        "citation_publication_date",
        "citation_date",
        "citation_online_date",
        "dc.date",
        "article:published_time",
        "og:article:published_time",
      ])
    ) || ""
  );
  const doi = cleanDoi(
    firstOf(metaValues(html, ["citation_doi", "dc.identifier", "prism.doi"])) || ""
  );
  let itemType: PageItemType | undefined;
  if (journal) itemType = "journalArticle";
  else if (book) itemType = "book";
  return {
    title,
    creators,
    itemType,
    date,
    abstract: firstOf(metaValues(html, ["citation_abstract", "dc.description"])),
    publicationTitle: journal || book,
    volume: firstOf(metaValues(html, ["citation_volume"])),
    issue: firstOf(metaValues(html, ["citation_issue"])),
    pages,
    doi,
    issn: firstOf(metaValues(html, ["citation_issn"])),
    isbn: cleanIsbn(firstOf(metaValues(html, ["citation_isbn"])) || ""),
    publisher: firstOf(metaValues(html, ["citation_publisher", "dc.publisher"])),
    language: firstOf(metaValues(html, ["citation_language", "dc.language"])),
  };
}

function citationFromJsonLd(html: string): (Partial<PageCitation> & { creators: PageCreator[] }) | null {
  const scripts = [...html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  const nodes: Record<string, unknown>[] = [];
  for (const match of scripts.slice(0, 8)) {
    const raw = match[1]?.trim();
    if (!raw || raw.length > 100_000) continue;
    try {
      collectLd(JSON.parse(raw) as unknown, nodes);
    } catch {
      /* ignore broken JSON-LD */
    }
  }
  const ranked = nodes
    .map((node) => ({ node, type: ldItemType(node) }))
    .filter((entry) => entry.type);
  ranked.sort((a, b) => typeRank(a.type) - typeRank(b.type));
  const picked = ranked[0];
  if (!picked?.type) return null;
  const node = picked.node;
  const creators = creatorsFromLd(node.author ?? node.creator);
  const publisher = publisherName(node.publisher);
  const isPartOf = textOf(record(node.isPartOf)?.name || record(node.isPartOf)?.headline);
  return {
    itemType: picked.type,
    title: textOf(node.headline) || textOf(node.name),
    creators,
    date: normalizeDate(textOf(node.datePublished) || textOf(node.dateCreated) || ""),
    abstract: textOf(node.description) || textOf(node.abstract),
    publicationTitle: isPartOf || (picked.type === "journalArticle" ? publisher : undefined),
    websiteTitle: publisher,
    publisher,
    doi: cleanDoi(textOf(node.identifier) || textOf(node.sameAs) || ""),
    url: textOf(node.url),
    language: textOf(node.inLanguage),
  };
}

function collectLd(value: unknown, out: Record<string, unknown>[]): void {
  if (!value) return;
  if (Array.isArray(value)) {
    for (const entry of value) collectLd(entry, out);
    return;
  }
  if (typeof value !== "object") return;
  const recordValue = value as Record<string, unknown>;
  if (recordValue["@graph"]) collectLd(recordValue["@graph"], out);
  out.push(recordValue);
}

function ldItemType(node: Record<string, unknown>): PageItemType | null {
  const raw = node["@type"];
  const types = Array.isArray(raw) ? raw : [raw];
  for (const type of types) {
    if (typeof type !== "string") continue;
    const key = type.toLowerCase().replace(/^https?:\/\/schema\.org\//, "");
    const mapped = ARTICLE_TYPES[key];
    if (mapped) return mapped;
    if (key === "article") return "magazineArticle";
  }
  return null;
}

function typeRank(type: PageItemType | null): number {
  if (type === "journalArticle") return 0;
  if (type === "newspaperArticle" || type === "blogPost" || type === "book") return 1;
  if (type === "magazineArticle") return 2;
  return 3;
}

function creatorsFromLd(value: unknown): PageCreator[] {
  const list = Array.isArray(value) ? value : value ? [value] : [];
  const creators: PageCreator[] = [];
  for (const entry of list) {
    if (typeof entry === "string") {
      creators.push(...parseCreatorList(entry));
      continue;
    }
    const person = record(entry);
    if (!person) continue;
    const type = String(person["@type"] || "").toLowerCase();
    const given = textOf(person.givenName);
    const family = textOf(person.familyName);
    if (given || family) {
      creators.push({ firstName: given || undefined, lastName: family || undefined });
      continue;
    }
    const name = textOf(person.name);
    if (!name) continue;
    if (type.includes("organization")) creators.push({ name });
    else creators.push(...parseCreatorList(name));
  }
  return creators;
}

function publisherName(value: unknown): string | undefined {
  if (typeof value === "string") return value.trim() || undefined;
  return textOf(record(value)?.name);
}

function resolveItemType(
  metaType: PageItemType | undefined,
  ldType: PageItemType | undefined,
  publication: string | undefined
): PageItemType {
  if (metaType === "journalArticle" || metaType === "book") return metaType;
  if (ldType === "journalArticle" || ldType === "newspaperArticle" || ldType === "blogPost" || ldType === "book") {
    return ldType;
  }
  if (metaType) return metaType;
  if (ldType === "magazineArticle" && publication) return "magazineArticle";
  return "webpage";
}

function metaValues(html: string, keys: string[]): string[] {
  const wanted = new Set(keys.map((key) => key.toLowerCase()));
  const out: string[] = [];
  const tags = html.match(/<meta\b[^>]*>/gi) ?? [];
  for (const tag of tags) {
    const name = (attr(tag, "name") || attr(tag, "property") || attr(tag, "itemprop")).toLowerCase();
    if (!wanted.has(name)) continue;
    const content = decodeHtmlEntities(attr(tag, "content"));
    if (content) out.push(content);
  }
  return out;
}

function attr(tag: string, name: string): string {
  const match = tag.match(
    new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'=<>]+))`, "i")
  );
  return (match?.[1] ?? match?.[2] ?? match?.[3] ?? "").trim();
}

export function parseCreatorList(raw: string): PageCreator[] {
  return raw
    .split(/\s+and\s+|;|\s*\|\s*/i)
    .map((part) => part.trim())
    .filter(Boolean)
    .map(parseCreator);
}

function authorHint(author: string | undefined): string {
  const value = author?.trim() || "";
  if (!value || /^https?:\/\//i.test(value)) return "";
  return value;
}

function parseCreator(name: string): PageCreator {
  if (name.includes(",")) {
    const [last, ...rest] = name.split(",").map((part) => part.trim());
    const first = rest.join(" ");
    return { firstName: first || undefined, lastName: last || undefined };
  }
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return { lastName: parts[0] };
  return { firstName: parts.slice(0, -1).join(" "), lastName: parts[parts.length - 1] };
}

function cleanDoi(raw: string): string | undefined {
  const match = raw.match(/10\.\d{4,9}\/[^\s"'<>]+/i);
  if (!match) return undefined;
  return match[0].replace(/[.,;]+$/, "");
}

function cleanIsbn(raw: string): string | undefined {
  const match = raw.match(/\b(?:97[89][-\s]?)?\d[-\d\s]{8,16}[\dX]\b/i);
  return match?.[0]?.replace(/\s+/g, "");
}

function doiFromUrl(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    if (!/(^|\.)doi\.org$/i.test(parsed.hostname)) return undefined;
    return cleanDoi(decodeURIComponent(parsed.pathname.replace(/^\//, "")));
  } catch {
    return undefined;
  }
}

export function normalizeDate(raw: string): string | undefined {
  const value = raw.trim();
  if (!value) return undefined;
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const slash = value.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})/);
  if (slash) return `${slash[1]}-${pad(slash[2])}-${pad(slash[3])}`;
  if (/^\d{4}$/.test(value)) return value;
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    const year = value.match(/\b(1[6-9]\d{2}|20\d{2}|21\d{2})\b/);
    return year?.[1];
  }
  const date = new Date(parsed);
  const year = date.getUTCFullYear();
  if (year < 1500 || year > 2200) return undefined;
  return `${year}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

function dateFromParts(parts: number[] | undefined): string | undefined {
  if (!parts?.length) return undefined;
  const [year, month, day] = parts;
  if (!year) return undefined;
  if (!month) return String(year);
  if (!day) return `${year}-${pad(month)}-01`;
  return `${year}-${pad(month)}-${pad(day)}`;
}

function crossrefItemType(type: string | undefined): PageItemType | null {
  switch (type) {
    case "journal-article":
      return "journalArticle";
    case "posted-content":
    case "manuscript":
      return "journalArticle";
    case "book":
    case "monograph":
      return "book";
    case "book-chapter":
      return "book";
    default:
      return null;
  }
}

function bibtexAuthor(creators: PageCreator[]): string {
  return creators
    .map((creator) => {
      if (creator.name && !creator.lastName) return creator.name;
      if (creator.lastName && creator.firstName) return `${creator.lastName}, ${creator.firstName}`;
      return creator.lastName || creator.firstName || creator.name || "";
    })
    .filter(Boolean)
    .join(" and ");
}

function citeKeyFromPage(citation: PageCitation): string {
  const creator = citation.creators[0];
  const last = (creator?.lastName || creator?.name || "web")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  const year = yearOf(citation.date) || "";
  const word =
    citation.title
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .split(/\s+/)
      .find((part) => part.length > 2 && !["the", "a", "an", "of", "and"].includes(part)) || "item";
  return `${last}${year}${word}`.slice(0, 40) || "item";
}

function yearOf(date: string | undefined): string {
  return date?.match(/\d{4}/)?.[0] || "";
}

function escapeBibtex(value: string): string {
  return value.replace(/[{}]/g, "");
}

function htmlLang(html: string): string | undefined {
  const match = html.match(/<html\b[^>]*\blang=["']([^"']+)["']/i);
  const lang = match?.[1]?.trim();
  return lang ? lang.slice(0, 35) : undefined;
}

function stripTags(value: string): string {
  return decodeHtmlEntities(value.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function firstOf(values: string[]): string | undefined {
  return values.map((value) => value.trim()).find(Boolean);
}

function firstText(...values: Array<string | undefined>): string {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) return decodeHtmlEntities(trimmed);
  }
  return "";
}

function textOf(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) return textOf(value[0]);
  return "";
}

function record(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function clip(value: string, max: number): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

function assign<K extends keyof PageCitation>(
  citation: PageCitation,
  key: K,
  value: PageCitation[K] | undefined
): void {
  if (value === undefined || value === "") return;
  if (citation[key]) return;
  citation[key] = value;
}

function pad(value: string | number): string {
  return String(value).padStart(2, "0");
}
