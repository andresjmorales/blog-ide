import {
  citeStyleToBibtex,
  formattedKeyForStyle,
  type CiteStyleId,
} from "@/lib/citations/citeStyle";
import { formatBibEntry, parseBibtex } from "@/lib/citations/formatBibtex";
import type { EssayCitation } from "@/lib/markdown/essayCitations";
import type { ZoteroSearchHit } from "@/lib/zotero/client";

export type CiteHit = {
  id: string;
  provider: "zotero" | "bibtex" | "library";
  citeKey: string;
  title: string;
  creators: string;
  year: string;
  itemType: string;
  formatted: string;
  bibtex: string;
  url?: string;
  /** Session Library row id when this hit is a saved PDF or bookmark. */
  libraryId?: string;
  zotero?: ZoteroSearchHit;
};

/** Compact kind chip: zotero / bibtex / link / pdf. */
export function hitKindLabel(hit: CiteHit): string {
  if (hit.provider === "zotero") return "zotero";
  if (hit.provider === "bibtex") return "bibtex";
  if (hit.itemType === "pdf") return "pdf";
  if (hit.itemType === "link" || hit.url) return "link";
  return hit.itemType || "item";
}

export function hitCanCite(hit: CiteHit): boolean {
  return hitKindLabel(hit) !== "pdf";
}

/** Idle Library list: saved items + pasted BibTeX, not essay snapshots. */
export function listBrowseHits(
  sessionHits: CiteHit[],
  libraryHits: CiteHit[]
): CiteHit[] {
  return mergeHits(sessionHits, libraryHits);
}

export function listSearchHits(
  remoteHits: CiteHit[],
  sessionHits: CiteHit[],
  essayHits: CiteHit[],
  libraryHits: CiteHit[],
  query: string
): CiteHit[] {
  return mergeHits(
    remoteHits,
    filterHits([...sessionHits, ...libraryHits, ...essayHits], query)
  );
}

function yearFromFields(fields: Record<string, string>): string {
  const raw = fields.year ?? fields.date ?? "";
  const match = raw.match(/\b(1[0-9]{3}|20[0-9]{2}|21[0-9]{2})\b/);
  return match?.[1] ?? raw;
}

function creatorsFromFields(fields: Record<string, string>): string {
  return (fields.author ?? fields.editor ?? "").replace(/\s+and\s+/gi, " and ");
}

export function hitsFromBibtex(source: string, style: CiteStyleId): CiteHit[] {
  const bibStyle = citeStyleToBibtex(style);
  return parseBibtex(source).map((entry) => {
    const formatted = formatBibEntry(entry, bibStyle);
    return {
      id: `bibtex:${entry.key}`,
      provider: "bibtex",
      citeKey: entry.key,
      title: entry.fields.title ?? "Untitled",
      creators: creatorsFromFields(entry.fields),
      year: yearFromFields(entry.fields),
      itemType: entry.type,
      formatted,
      bibtex: source.includes(`@${entry.type}`)
        ? sliceBibtexEntry(source, entry.key) || rawEntryFallback(entry)
        : rawEntryFallback(entry),
    };
  });
}

function rawEntryFallback(entry: {
  type: string;
  key: string;
  fields: Record<string, string>;
}): string {
  const fields = Object.entries(entry.fields)
    .map(([key, value]) => `  ${key} = {${value}}`)
    .join(",\n");
  return `@${entry.type}{${entry.key},\n${fields}\n}`;
}

function sliceBibtexEntry(source: string, key: string): string {
  const start = source.search(
    new RegExp(`@\\w+\\s*\\{\\s*${escapeRegExp(key)}\\s*,`, "i")
  );
  if (start < 0) return "";
  let depth = 0;
  let started = false;
  for (let i = start; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === "{") {
      depth += 1;
      started = true;
    } else if (ch === "}") {
      depth -= 1;
      if (started && depth === 0) return source.slice(start, i + 1).trim();
    }
  }
  return "";
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function hitFromZotero(hit: ZoteroSearchHit): CiteHit {
  return {
    id: `zotero:${hit.key}`,
    provider: "zotero",
    citeKey: hit.citeKey,
    title: hit.title,
    creators: hit.creators,
    year: hit.year,
    itemType: hit.itemType,
    formatted: hit.citation,
    bibtex: hit.bibtex,
    url: hit.url,
    zotero: hit,
  };
}

export function hitFromEssayCitation(
  citation: EssayCitation,
  style: CiteStyleId
): CiteHit {
  const key = formattedKeyForStyle(style);
  const formatted =
    citation.formatted[key] ||
    citation.formatted["chicago-note"] ||
    citation.formatted.mla ||
    citation.formatted["chicago-bib"] ||
    "";
  return {
    id: citation.id,
    provider: citation.provider,
    citeKey: citation.citeKey,
    title: citation.title,
    creators: "",
    year: "",
    itemType: citation.provider,
    formatted,
    bibtex: citation.bibtex ?? "",
    url: citation.url,
  };
}

export function citationFromHit(
  hit: CiteHit,
  style: CiteStyleId
): EssayCitation {
  return {
    id: hit.zotero?.key ?? hit.id,
    provider: hit.provider,
    citeKey: hit.citeKey,
    title: hit.title,
    formatted: { [formattedKeyForStyle(style)]: hit.formatted },
    bibtex: hit.bibtex || undefined,
    url: hit.url,
  };
}

export function filterHits(hits: CiteHit[], query: string): CiteHit[] {
  const q = query.trim().toLowerCase();
  if (!q) return hits;
  return hits.filter((hit) => {
    const hay =
      `${hit.title} ${hit.creators} ${hit.year} ${hit.citeKey} ${hit.itemType} ${hit.url ?? ""}`.toLowerCase();
    return hay.includes(q);
  });
}

export function mergeHits(...lists: CiteHit[][]): CiteHit[] {
  const seen = new Set<string>();
  const out: CiteHit[] = [];
  for (const list of lists) {
    for (const hit of list) {
      const key = hit.zotero?.key ?? hit.citeKey ?? hit.id;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(hit);
    }
  }
  return out;
}
