/**
 * Optional Pandoc binary. Unset on typical Vercel deploys; self-host can
 * point PANDOC_PATH at `/usr/bin/pandoc` (or similar).
 *
 * PDF also needs a PDF engine. Set PANDOC_PDF_ENGINE (xelatex, pdflatex,
 * weasyprint, typst, …) or let the server pick the first one on PATH.
 */

export const PANDOC_MARKDOWN_FROM =
  "markdown+footnotes+pipe_tables+strike+raw_html+autolink_bare_uris";

export const PANDOC_MARKDOWN_TO =
  "markdown+footnotes+pipe_tables+strike-raw_html";

export const PANDOC_PDF_ENGINES = [
  "xelatex",
  "lualatex",
  "pdflatex",
  "weasyprint",
  "typst",
] as const;

export function getPandocPath(): string | null {
  const raw = process.env.PANDOC_PATH?.trim();
  return raw || null;
}

export function getPandocPdfEnginePref(): string | null {
  const raw = process.env.PANDOC_PDF_ENGINE?.trim();
  return raw || null;
}

export function isPandocConfigured(): boolean {
  return Boolean(getPandocPath());
}
