import type { LinkPreview } from "@/lib/preview/openGraph";
import type { PageCreator } from "@/lib/preview/pageCitation";

function creatorName(creator: PageCreator): string {
  if (creator.name) return creator.name.trim();
  return [creator.firstName, creator.lastName]
    .filter(Boolean)
    .join(" ")
    .trim();
}

/** "A", "A and B", or "A et al." for three or more. */
export function formatAuthors(creators: PageCreator[]): string {
  const names = creators.map(creatorName).filter(Boolean);
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names[0]} et al.`;
}

/**
 * Author and year for the link bubble ("Jane Smith · 2021"), so footnote
 * details are visible without opening the page. Empty when neither is known.
 */
export function previewByline(preview: LinkPreview | null): string {
  if (!preview) return "";
  const citation = preview.citation;
  const authors =
    formatAuthors(citation?.creators ?? []) || preview.author?.trim() || "";
  const year = citation?.date?.match(/\d{4}/)?.[0] ?? "";
  return [authors, year].filter(Boolean).join(" · ");
}
