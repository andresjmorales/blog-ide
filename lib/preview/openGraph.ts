import { decodeHtmlEntities } from "@/lib/preview/htmlEntities";

export type LinkPreview = {
  url: string;
  title: string;
  description: string;
  siteName: string;
  image: string | null;
  author?: string;
};

function metaContent(html: string, ...keys: string[]): string {
  for (const key of keys) {
    const prop = new RegExp(
      `<meta[^>]+(?:property|name)=["']${key}["'][^>]+content=["']([^"']+)["']`,
      "i"
    );
    const prop2 = new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${key}["']`,
      "i"
    );
    const match = html.match(prop) || html.match(prop2);
    if (match?.[1]) return decodeHtmlEntities(match[1].trim());
  }
  return "";
}

function absoluteUrl(base: string, maybe: string | null): string | null {
  if (!maybe) return null;
  try {
    return new URL(maybe, base).href;
  } catch {
    return null;
  }
}

export function extractOpenGraph(html: string, pageUrl: string): LinkPreview {
  const title =
    metaContent(html, "og:title", "twitter:title") ||
    html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() ||
    pageUrl;

  const description =
    metaContent(html, "og:description", "twitter:description", "description") ||
    "";

  const siteName =
    metaContent(html, "og:site_name") || new URL(pageUrl).hostname;

  const image = absoluteUrl(
    pageUrl,
    metaContent(html, "og:image", "twitter:image") || null
  );

  const author = metaContent(html, "author", "article:author") || undefined;

  return {
    url: pageUrl,
    title: decodeHtmlEntities(title).slice(0, 300),
    description: decodeHtmlEntities(description).slice(0, 600),
    siteName: decodeHtmlEntities(siteName).slice(0, 120),
    image,
    author,
  };
}
