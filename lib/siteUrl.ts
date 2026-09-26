/** Public site origin (client- or server-safe). Prefer NEXT_PUBLIC_SITE_URL. */
export function getPublicSiteUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }
  return "http://localhost:3000";
}

/**
 * Only allow same-origin relative paths for post-auth redirects
 * (blocks open redirects via ?next=).
 */
export function safeNextPath(
  next: string | null | undefined,
  fallback: string
): string {
  if (!next) return fallback;
  if (!next.startsWith("/") || next.startsWith("//")) return fallback;
  if (next.includes("://")) return fallback;
  // Browsers read "/\evil.com" (and "/\t/evil.com") as "//evil.com", so
  // resolve the path the way the redirect will and require the same origin.
  const base = "http://same-origin.invalid";
  try {
    const resolved = new URL(next, base);
    if (resolved.origin !== base) return fallback;
    return `${resolved.pathname}${resolved.search}${resolved.hash}`;
  } catch {
    return fallback;
  }
}
