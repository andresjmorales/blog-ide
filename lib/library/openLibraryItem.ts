import type { CiteHit } from "@/lib/citations/localHits";
import { hitKindLabel } from "@/lib/citations/localHits";
import type { LibraryMeta } from "@/lib/library/sessionLibrary";

export type LibraryOpenTarget =
  | { kind: "pdf"; src: string; title: string }
  | { kind: "link"; url: string; title: string };

export function libraryHitIsPdf(
  hit: Pick<CiteHit, "itemType" | "provider">,
  entry?: Pick<LibraryMeta, "kind"> | null
): boolean {
  return entry?.kind === "pdf" || hitKindLabel(hit as CiteHit) === "pdf";
}

/**
 * Decide how to open a Library / cite row.
 * PDFs with a public storage URL must still open in the PDF pin, not the
 * link reader — that URL is the file, not a webpage.
 */
export async function resolveLibraryOpenTarget(
  entries: LibraryMeta[],
  hit: CiteHit,
  resolvePdfSrc: (entry: LibraryMeta) => Promise<string | null>
): Promise<LibraryOpenTarget | null> {
  const entry = hit.libraryId
    ? entries.find((item) => item.id === hit.libraryId)
    : undefined;

  if (libraryHitIsPdf(hit, entry)) {
    const src = entry
      ? await resolvePdfSrc(entry)
      : hit.url && /\.pdf(?:$|[?#])/i.test(hit.url)
        ? hit.url
        : hit.url ?? null;
    if (!src) return null;
    return { kind: "pdf", src, title: entry?.name ?? hit.title };
  }

  if (entry?.kind === "link" && entry.url) {
    return { kind: "link", url: entry.url, title: entry.name };
  }
  if (hit.url) {
    return { kind: "link", url: hit.url, title: hit.title };
  }
  return null;
}
