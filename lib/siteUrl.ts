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
  return next;
}
