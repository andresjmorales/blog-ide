import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/requireUser";
import { readBodyCapped, safePublicFetch } from "@/lib/preview/ssrf";
import { extractOpenGraph, type LinkPreview } from "@/lib/preview/openGraph";
import { enrichWithCrossref } from "@/lib/preview/pageCitation";
import { cacheGet, cacheSet } from "@/lib/preview/cache";

export const runtime = "nodejs";

const MAX_BYTES = 512_000;
const TIMEOUT_MS = 5000;

export async function GET(request: Request) {
  const denied = await requireUser();
  if (denied) return denied;

  const url = new URL(request.url).searchParams.get("url");
  if (!url) {
    return NextResponse.json({ error: "Missing url" }, { status: 400 });
  }

  const cached = cacheGet<LinkPreview>(`og:${url}`);
  if (cached) {
    return NextResponse.json(cached);
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let response: Response;
    let merged: Uint8Array;
    try {
      // Every redirect hop is validated before it is requested.
      response = await safePublicFetch(url, {
        signal: controller.signal,
        headers: {
          Accept: "text/html,application/xhtml+xml",
          "User-Agent": "BlogIDE-LinkPreview/1.0",
        },
      });

      const type = response.headers.get("content-type") || "";
      if (!type.includes("text/html") && !type.includes("application/xhtml")) {
        response.body?.cancel().catch(() => {});
        return NextResponse.json(
          { error: "URL is not an HTML page" },
          { status: 415 }
        );
      }
      merged = await readBodyCapped(response, MAX_BYTES);
    } finally {
      clearTimeout(timer);
    }

    const html = new TextDecoder("utf-8").decode(merged);
    const preview = extractOpenGraph(html, response.url || url);
    if (preview.citation?.doi) {
      preview.citation = await enrichWithCrossref(preview.citation);
    }
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
