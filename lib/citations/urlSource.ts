/**
 * Turn a saved or hovered URL into footnote metadata. Uses the link preview
 * (citation tags, JSON-LD, Open Graph, and Crossref when a DOI is present).
 */

import { bibtexFromPageCitation, type PageCitation } from "@/lib/preview/pageCitation";
import { fetchLinkPreview, type LinkPreview } from "@/lib/preview/client";

export type ResolvedPageSource = {
  title: string;
  citation: PageCitation;
  bibtex?: string;
  citeKey?: string;
};

export async function resolvePageSource(input: {
  url: string;
  title?: string;
  preview?: LinkPreview | null;
}): Promise<ResolvedPageSource> {
  let preview = input.preview ?? null;
  if (!preview?.citation) {
    try {
      preview = await fetchLinkPreview(input.url);
    } catch {
      preview = preview ?? null;
    }
  }
  const citation =
    preview?.citation ??
    minimalCitation(input.url, preview?.title || input.title || "");
  const bib = bibtexFromPageCitation(citation);
  const title =
    (citation.title && citation.title !== input.url ? citation.title : "") ||
    preview?.title ||
    input.title ||
    input.url;
  return {
    title,
    citation,
    bibtex: bib?.bibtex,
    citeKey: bib?.citeKey,
  };
}

function minimalCitation(url: string, title: string): PageCitation {
  return {
    itemType: "webpage",
    title: title.trim() || url,
    creators: [],
    url,
    websiteTitle: undefined,
  };
}
