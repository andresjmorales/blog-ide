import type { LinkPreview } from "@/lib/preview/openGraph";

export type { LinkPreview };

const PREVIEW_CACHE_MAX = 100;
/** Session cache: re-tapping a link (or Cite / Library on it) skips the round trip. */
const previewCache = new Map<string, Promise<LinkPreview>>();

export function fetchLinkPreview(url: string): Promise<LinkPreview> {
  const cached = previewCache.get(url);
  if (cached) return cached;
  const request = requestLinkPreview(url);
  previewCache.set(url, request);
  if (previewCache.size > PREVIEW_CACHE_MAX) {
    const oldest = previewCache.keys().next().value;
    if (oldest !== undefined) previewCache.delete(oldest);
  }
  // Failures are not cached so a retry can succeed.
  request.catch(() => {
    if (previewCache.get(url) === request) previewCache.delete(url);
  });
  return request;
}

async function requestLinkPreview(url: string): Promise<LinkPreview> {
  const res = await fetch(
    `/api/link-preview?url=${encodeURIComponent(url)}`
  );
  const data = (await res.json()) as LinkPreview & { error?: string };
  if (!res.ok) {
    throw new Error(data.error || `Preview failed (${res.status})`);
  }
  return data;
}

export async function fetchReaderExtract(url: string): Promise<{
  url: string;
  title: string;
  siteName: string;
  text: string;
}> {
  const res = await fetch(`/api/reader?url=${encodeURIComponent(url)}`);
  const data = (await res.json()) as {
    url: string;
    title: string;
    siteName: string;
    text: string;
    error?: string;
  };
  if (!res.ok) {
    throw new Error(data.error || `Reader failed (${res.status})`);
  }
  return data;
}
