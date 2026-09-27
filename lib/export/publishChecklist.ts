/**
 * What in an essay will not paste cleanly into another editor (Substack
 * first). Drives the Publish tab checklist: each item says how many there
 * are, what the copy does with them, and whether the helper finishes it.
 */

import { preparePublicationBody } from "@/lib/export/clipboardHtml";

export type PublishImageInventory = {
  total: number;
  /** Supabase signed URLs: fine to paste, dead a day later if not re-hosted. */
  expiring: number;
  /** data: URLs (vault / offline images). Many editors drop these. */
  embedded: number;
  /** Relative or site paths that only resolve on your own site. */
  relative: number;
  captions: number;
};

export type PublishInventory = {
  footnotes: number;
  images: PublishImageInventory;
  /** Content `<sup>` / `<sub>` (not footnote refs). */
  scripts: number;
  inlineMath: number;
  blockMath: number;
  poems: number;
  tables: number;
};

const SIGNED_URL_RE = /\/storage\/v1\/object\/sign\//;

export function emptyPublishInventory(): PublishInventory {
  return {
    footnotes: 0,
    images: { total: 0, expiring: 0, embedded: 0, relative: 0, captions: 0 },
    scripts: 0,
    inlineMath: 0,
    blockMath: 0,
    poems: 0,
    tables: 0,
  };
}

export function analyzePublishInventory(markdown: string): PublishInventory {
  const out = emptyPublishInventory();
  const prepared = preparePublicationBody(markdown);
  if (!prepared) return out;
  const { root } = prepared;

  out.footnotes = root.querySelectorAll(".preview-fn").length;

  for (const img of root.querySelectorAll("img")) {
    const src = (img.getAttribute("src") ?? "").trim();
    out.images.total += 1;
    if (src.startsWith("data:")) out.images.embedded += 1;
    else if (!/^https?:\/\//i.test(src)) out.images.relative += 1;
    else if (SIGNED_URL_RE.test(src)) out.images.expiring += 1;
  }
  out.images.captions = root.querySelectorAll("figcaption").length;

  out.scripts = root.querySelectorAll("sup, sub").length;
  out.inlineMath = root.querySelectorAll(".blogide-inline-math").length;
  out.blockMath = root.querySelectorAll(".blogide-block-math").length;
  out.poems = root.querySelectorAll("div.poetry").length;
  out.tables = root.querySelectorAll("table").length;
  return out;
}

/** Short summary for the copy toast, e.g. "3 footnotes, 2 images". */
export function inventorySummary(
  inventory: PublishInventory,
  options: { footnotes: boolean; images: boolean }
): string {
  const parts: string[] = [];
  const plural = (n: number, word: string) =>
    `${n} ${word}${n === 1 ? "" : "s"}`;
  if (inventory.footnotes) {
    parts.push(
      options.footnotes
        ? plural(inventory.footnotes, "footnote marker")
        : plural(inventory.footnotes, "static footnote")
    );
  }
  if (inventory.images.total) {
    parts.push(
      options.images
        ? plural(inventory.images.total, "image")
        : `${plural(inventory.images.total, "image")} left out`
    );
  }
  if (inventory.poems) parts.push(plural(inventory.poems, "poem"));
  if (inventory.blockMath) parts.push(plural(inventory.blockMath, "equation"));
  return parts.join(", ");
}
