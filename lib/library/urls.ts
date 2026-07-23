/** Normalize for Library link identity (trailing slash / default ports). */
export function canonicalizeLibraryUrl(raw: string): string | null {
  try {
    const parsed = new URL(raw.trim());
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    parsed.hash = "";
    return parsed.href.replace(/\/$/, "") || parsed.origin;
  } catch {
    return null;
  }
}
