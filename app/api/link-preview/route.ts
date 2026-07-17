import { NextResponse } from "next/server";
import { assertSafePublicUrl } from "@/lib/preview/ssrf";
import { extractOpenGraph, type LinkPreview } from "@/lib/preview/openGraph";
import { cacheGet, cacheSet } from "@/lib/preview/cache";

export const runtime = "nodejs";

const MAX_BYTES = 512_000;
const TIMEOUT_MS = 5000;

export async function GET(request: Request) {
  const url = new URL(request.url).searchParams.get("url");
  if (!url) {
    return NextResponse.json({ error: "Missing url" }, { status: 400 });
  }

  const cached = cacheGet<LinkPreview>(`og:${url}`);
  if (cached) {
    return NextResponse.json(cached);
  }

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
          "User-Agent": "BlogIDE-LinkPreview/1.0",
        },
      });
    } finally {
      clearTimeout(timer);
    }

    // Re-check final URL after redirects
    await assertSafePublicUrl(response.url);

    const type = response.headers.get("content-type") || "";
    if (!type.includes("text/html") && !type.includes("application/xhtml")) {
      return NextResponse.json(
        { error: "URL is not an HTML page" },
        { status: 415 }
      );
    }

    const reader = response.body?.getReader();
    if (!reader) {
      return NextResponse.json({ error: "Empty response" }, { status: 502 });
    }

    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        total += value.byteLength;
        if (total > MAX_BYTES) {
          reader.cancel().catch(() => {});
          break;
        }
        chunks.push(value);
      }
    }

    const merged = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const html = new TextDecoder("utf-8").decode(merged);
    const preview = extractOpenGraph(html, response.url || safe.href);
    cacheSet(`og:${url}`, preview);
    cacheSet(`og:${preview.url}`, preview);
    return NextResponse.json(preview);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Preview fetch failed";
    const status =
      message.includes("not allowed") || message.includes("Private")
        ? 400
        : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
