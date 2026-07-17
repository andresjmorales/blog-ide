import type { LinkPreview } from "@/lib/preview/openGraph";

export async function fetchLinkPreview(url: string): Promise<LinkPreview> {
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
