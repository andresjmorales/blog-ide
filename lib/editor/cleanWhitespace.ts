/**
 * Collapse PDF-style hard wraps: all whitespace runs (including newlines)
 * become a single space. Useful for cleaning pasted text from PDFs.
 */
export function cleanWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}
