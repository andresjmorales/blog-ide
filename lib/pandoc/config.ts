/**
 * Optional Pandoc binary. Unset on typical Vercel deploys; self-host can
 * point PANDOC_PATH at `/usr/bin/pandoc` (or similar).
 */

export const PANDOC_MARKDOWN_FROM =
  "markdown+footnotes+pipe_tables+strike+raw_html+autolink_bare_uris";

export const PANDOC_MARKDOWN_TO =
  "markdown+footnotes+pipe_tables+strike-raw_html";

export function getPandocPath(): string | null {
  const raw = process.env.PANDOC_PATH?.trim();
  return raw || null;
}

export function isPandocConfigured(): boolean {
  return Boolean(getPandocPath());
}
