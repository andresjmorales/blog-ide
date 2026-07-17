import { NextResponse } from "next/server";
import { assertSafePublicUrl } from "@/lib/preview/ssrf";
import { cacheGet, cacheSet } from "@/lib/preview/cache";
import { extractOpenGraph } from "@/lib/preview/openGraph";

export const runtime = "nodejs";

const MAX_BYTES = 800_000;
const TIMEOUT_MS = 8000;

type ReaderPayload = {
  url: string;
  title: string;
  siteName: string;
  /** Rough plain-text extract — not full Readability */
  text: string;
};

function extractMainText(html: string): string {
  const cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    .replace(/<header[\s\S]*?<\/header>/gi, " ");

  const article =
    cleaned.match(/<article[\s\S]*?<\/article>/i)?.[0] ||
    cleaned.match(/<main[\s\S]*?<\/main>/i)?.[0] ||
    cleaned;

  const text = article
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/h[1-6]>/gi, "\n\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();

  return text.slice(0, 12_000);
}

export async function GET(request: Request) {
  const url = new URL(request.url).searchParams.get("url");
  if (!url) {
    return NextResponse.json({ error: "Missing url" }, { status: 400 });
  }

  const cached = cacheGet<ReaderPayload>(`reader:${url}`);
  if (cached) return NextResponse.json(cached);

  try {
    const safe = await assertSafePublicUrl(url);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(safe.href, {
        redirect: "follow",
        signal: controller.signal,
        headers: {
          Accept: "text/html,application/xhtml+xml",
          "User-Agent": "BlogIDE-Reader/1.0",
        },
      });
    } finally {
      clearTimeout(timer);
    }

    await assertSafePublicUrl(response.url);
    const type = response.headers.get("content-type") || "";
    if (!type.includes("text/html") && !type.includes("application/xhtml")) {
      return NextResponse.json(
        { error: "URL is not an HTML page" },
        { status: 415 }
      );
    }

    const buf = Buffer.from(await response.arrayBuffer());
    const html = buf.subarray(0, MAX_BYTES).toString("utf8");
    const og = extractOpenGraph(html, response.url || safe.href);
    const text = extractMainText(html);
    if (!text) {
      return NextResponse.json(
        { error: "Could not extract readable text" },
        { status: 422 }
      );
    }

    const payload: ReaderPayload = {
      url: og.url,
      title: og.title,
      siteName: og.siteName,
      text,
    };
    cacheSet(`reader:${url}`, payload);
    return NextResponse.json(payload);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Reader fetch failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
