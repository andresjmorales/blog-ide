/**
 * BlogIDE-only index of sources this essay actually used. Stored as an HTML
 * comment trailer so plain exports stay readable. The footnote body is the
 * human copy; this index is for restyle, jump-to, and offline re-copy.
 */

export type EssayCitationProvider = "zotero" | "bibtex" | "library";

export type EssayCitationFormatted = {
  "chicago-note"?: string;
  "chicago-bib"?: string;
  mla?: string;
};

export type EssayCitation = {
  id: string;
  provider: EssayCitationProvider;
  citeKey: string;
  title: string;
  formatted: EssayCitationFormatted;
  bibtex?: string;
  footnoteIds?: string[];
};

export const CITATIONS_TRAILER_PREFIX = "blogide-citations";

const LAST_TRAILER_RE =
  /<!--blogide-(deleted-footnotes|citations):([\s\S]*?)-->\s*$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function parseFormatted(raw: unknown): EssayCitationFormatted {
  if (!isRecord(raw)) return {};
  const formatted: EssayCitationFormatted = {};
  if (typeof raw["chicago-note"] === "string") {
    formatted["chicago-note"] = raw["chicago-note"];
  }
  if (typeof raw["chicago-bib"] === "string") {
    formatted["chicago-bib"] = raw["chicago-bib"];
  }
  if (typeof raw.mla === "string") formatted.mla = raw.mla;
  return formatted;
}

export function parseEssayCitationsJson(payload: string): EssayCitation[] {
  try {
    const parsed = JSON.parse(payload) as unknown;
    if (!Array.isArray(parsed)) return [];
    const citations: EssayCitation[] = [];
    for (const entry of parsed) {
      if (!isRecord(entry)) continue;
      if (typeof entry.id !== "string" || !entry.id) continue;
      if (
        entry.provider !== "zotero" &&
        entry.provider !== "bibtex" &&
        entry.provider !== "library"
      ) {
        continue;
      }
      if (typeof entry.citeKey !== "string") continue;
      if (typeof entry.title !== "string") continue;
      const footnoteIds = Array.isArray(entry.footnoteIds)
        ? entry.footnoteIds.filter((id): id is string => typeof id === "string")
        : undefined;
      citations.push({
        id: entry.id,
        provider: entry.provider,
        citeKey: entry.citeKey,
        title: entry.title,
        formatted: parseFormatted(entry.formatted),
        bibtex: typeof entry.bibtex === "string" ? entry.bibtex : undefined,
        footnoteIds: footnoteIds?.length ? footnoteIds : undefined,
      });
    }
    return citations;
  } catch {
    return [];
  }
}

export function serializeEssayCitation(citation: EssayCitation): EssayCitation {
  const formatted: EssayCitationFormatted = {};
  if (citation.formatted["chicago-note"]) {
    formatted["chicago-note"] = citation.formatted["chicago-note"];
  }
  if (citation.formatted["chicago-bib"]) {
    formatted["chicago-bib"] = citation.formatted["chicago-bib"];
  }
  if (citation.formatted.mla) formatted.mla = citation.formatted.mla;
  const next: EssayCitation = {
    id: citation.id,
    provider: citation.provider,
    citeKey: citation.citeKey,
    title: citation.title,
    formatted,
  };
  if (citation.bibtex) next.bibtex = citation.bibtex;
  if (citation.footnoteIds?.length) next.footnoteIds = citation.footnoteIds;
  return next;
}

export function appendCitationsTrailer(
  body: string,
  citations: EssayCitation[]
): string {
  if (citations.length === 0) return body;
  const trimmed = body.replace(/\s+$/, "");
  const payload = JSON.stringify(citations.map(serializeEssayCitation));
  return `${trimmed}\n\n<!--${CITATIONS_TRAILER_PREFIX}:${payload}-->\n`;
}

export type BlogideTrailers = {
  body: string;
  deletedPayload: string | null;
  citations: EssayCitation[];
};

/**
 * Peel BlogIDE HTML-comment trailers from the end of a markdown body.
 * Either comment may appear last; both are removed before TipTap parse.
 */
export function stripBlogideTrailers(body: string): BlogideTrailers {
  let rest = body;
  let deletedPayload: string | null = null;
  let citations: EssayCitation[] = [];
  let found = false;

  while (true) {
    const end = rest.replace(/\s+$/, "");
    const open = end.lastIndexOf("<!--blogide-");
    if (open < 0) break;
    const slice = end.slice(open);
    const match = slice.match(LAST_TRAILER_RE);
    if (!match) break;
    found = true;
    if (match[1] === "deleted-footnotes") {
      deletedPayload = match[2];
    } else {
      citations = parseEssayCitationsJson(match[2]);
    }
    rest = end.slice(0, open);
  }

  if (!found) {
    return { body, deletedPayload: null, citations: [] };
  }

  return {
    body: rest.replace(/\s+$/, "") + "\n",
    deletedPayload,
    citations,
  };
}

export function formattedStrings(citation: EssayCitation): string[] {
  return [
    citation.formatted["chicago-note"],
    citation.formatted["chicago-bib"],
    citation.formatted.mla,
  ].filter((value): value is string => Boolean(value));
}

export function citationMatchesText(
  citation: EssayCitation,
  text: string
): boolean {
  const needle = text.trim();
  if (!needle) return false;
  return formattedStrings(citation).some((value) => value.trim() === needle);
}

export function mergeEssayCitation(
  existing: EssayCitation[],
  incoming: EssayCitation
): EssayCitation[] {
  const index = existing.findIndex((entry) => entry.id === incoming.id);
  if (index === -1) return [...existing, serializeEssayCitation(incoming)];
  const prior = existing[index];
  const footnoteIds = [
    ...new Set([...(prior.footnoteIds ?? []), ...(incoming.footnoteIds ?? [])]),
  ];
  const next = serializeEssayCitation({
    ...prior,
    ...incoming,
    formatted: { ...prior.formatted, ...incoming.formatted },
    footnoteIds: footnoteIds.length ? footnoteIds : undefined,
    bibtex: incoming.bibtex ?? prior.bibtex,
  });
  const copy = existing.slice();
  copy[index] = next;
  return copy;
}
