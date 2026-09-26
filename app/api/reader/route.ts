import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/requireUser";
import { readBodyCapped, safePublicFetch } from "@/lib/preview/ssrf";
import { cacheGet, cacheSet } from "@/lib/preview/cache";
import { extractOpenGraph } from "@/lib/preview/openGraph";
import { extractMainText } from "@/lib/preview/readerExtract";

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


export async function GET(request: Request) {
  const denied = await requireUser();
  if (denied) return denied;

  const url = new URL(request.url).searchParams.get("url");
  if (!url) {
    return NextResponse.json({ error: "Missing url" }, { status: 400 });
  }

  // v3: source-specific Wikipedia / LessWrong extracts
  const cached = cacheGet<ReaderPayload>(`reader:v3:${url}`);
  if (cached) return NextResponse.json(cached);

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let response: Response;
    let html: string;
    try {
      // Every redirect hop is validated before it is requested.
      response = await safePublicFetch(url, {
        signal: controller.signal,
        headers: {
          Accept: "text/html,application/xhtml+xml",
          "User-Agent": "BlogIDE-Reader/1.0",
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
      // Stop reading at the cap instead of buffering the whole body first.
      html = new TextDecoder("utf-8").decode(
        await readBodyCapped(response, MAX_BYTES)
      );
    } finally {
      clearTimeout(timer);
    }

    const og = extractOpenGraph(html, response.url || url);
    const text = extractMainText(html, response.url || url);
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
    cacheSet(`reader:v3:${url}`, payload);
    return NextResponse.json(payload);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Reader fetch failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
